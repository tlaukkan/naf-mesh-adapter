const SignalingChannel = require('@tlaukkan/webrtc-signaling').SignalingChannel;

class Peer {
    constructor(peerUrl) {
        const lastIndex = peerUrl.lastIndexOf('/');
        this.peerUrl = peerUrl
        this.signalingServerUrl = peerUrl.substr(0, lastIndex)
        this.peerId = peerUrl.substr(lastIndex + 1)
    }
}

class DataMessage {
    constructor(dataType, data) {
        this.dataType = dataType
        this.data = data
    }
}

/**
 * Mesh Adapter
 *
 * Peer URLs structure is: '<signalingServerUrl>/<peerId>'
 */
class MeshAdapter {

    constructor(PeerConnection, WebSocketImplementation) {
        if (PeerConnection) {
            this.RTCPeerConnection = PeerConnection
        } else {
            this.RTCPeerConnection = RTCPeerConnection
        }

        if (WebSocketImplementation) {
            this.WebSocket = WebSocketImplementation
        } else {
            this.WebSocket = WebSocket
        }

        this.debugLog('--- mesh adapter constructor ---')

        // The default app. Not in use currently.
        this.app = 'default'
        // The default room. Not in use currently.
        this.room = 'default';

        // WebRTC configuration
        this.configuration = {iceServers: [{urls: 'stun:stun1.l.google.com:19302'}]};
        // The WebRTC options not in use currently.
        this.options = null

        // Email for connecting to signaling server
        this.email = Date.now().toString();
        // Secret for connecting to signaling server
        this.secret = Date.now().toString();
        // Debug log prefix. Disabled when null.
        this.debugLogPrefix = null

        // Primary signaling server URL for this client
        this.signalingServerUrl = 'wss://tlaukkan-webrtc-signaling.herokuapp.com'
        // Client own peer URL formed from primary signaling server URL and self peer ID.
        this.selfPeerUrl = null
        // First remote peer URL or null if this is first node in mesh. Change to array?
        this.serverPeerUrls = null

        // The signaling channel used for WebRTC signaling.
        this.signalingChannel = new SignalingChannel(this.WebSocket)
        // Map of own signaling server URLs and peer IDs
        this.selfSignalingServerUrlPeerIdMap = new Map()
        // Map of own peer URLs and peer objects
        this.selfPeers = new Map()
        // Map of peer URL and RTC Peer Connections
        this.connections = new Map()
        // Map of peer URL and RTC Data Channels
        this.channels = new Map()
        // Map of peer URLs and true or false indicating connection status
        this.peers = new Map()

        //TODO Remove hack added for adapter test page
        if (typeof (document) !== 'undefined') {
            this.email = document.title
            this.secret = document.title
            this.debugLogPrefix = document.title
        }

        this.debugLog('--- mesh adapter constructor ---')
    }

    // ### INTERFACE FUNCTIONS ###

    setSignalServerUrl(signalServerUrl) {
        this.signalingServerUrl = signalServerUrl
    }

    setServerPeerUrls(serverPeerUrls) {
        this.serverPeerUrls = serverPeerUrls
    }

    setServerUrl(serverPeerUrl) {
        this.debugLog('--- mesh adapter set server url ---')
        this.debugLog('set server URL to server peer URL: ' + serverPeerUrl)
        if (serverPeerUrl) {
            this.serverPeerUrls = serverPeerUrl;
        }
        this.debugLog('--- mesh adapter set server url ---')
    }

    setApp(appName) {
        this.debugLog('--- mesh adapter set app name ---')
        this.app = appName;
        this.debugLog('--- mesh adapter set app name ---')
    }

    setRoom(roomName) {
        this.debugLog('--- mesh adapter set app name ---')
        this.room = roomName;
        this.debugLog('--- mesh adapter set app name ---')
    }

    setWebRtcOptions(options) {
        this.debugLog('--- mesh adapter set web rtc options ---')
        this.options = options
        this.debugLog('--- mesh adapter set web rtc options ---')
    }

    setServerConnectListeners(successListener, failureListener) {
        this.debugLog('--- mesh adapter set server connect listener ---')
        this.connectSuccess = successListener;
        this.connectFailure = failureListener;
        this.debugLog('--- mesh adapter set server connect listener ---')
    }

    setRoomOccupantListener(occupantListener) {
        this.debugLog('--- mesh adapter set room occupant listener ---')
        this.roomOccupantListener = occupantListener;
        this.debugLog('--- mesh adapter set room occupant listener ---')
    }

    setDataChannelListeners(openListener, closedListener, messageListener) {
        this.debugLog('--- mesh adapter set data channel listeners ---')
        this.openListener = openListener;
        this.closedListener = closedListener;
        this.messageListener = messageListener;
        this.debugLog('--- mesh adapter set data channel listeners ---')
    }

    connect() {
        const self = this

        this.debugLog('--- mesh adapter connect ---')

        this.signalingChannel.addServer(this.signalingServerUrl, this.email, this.secret, async (signalServerUrl, selfPeerId) => {
            self.selfPeerUrl = signalServerUrl + '/' + selfPeerId
            if (self.connectSuccess) {
                self.connectSuccess(self.selfPeerUrl);
            }
            if (self.serverPeerUrls && self.serverPeerUrls.length > 3) {
                self.serverPeerUrls.split(',').forEach(async serverPeerUrl => {
                    await self.offer(new Peer(serverPeerUrl), selfPeerId);
                })
            } else {
                //console.log('mesh adapter did not send offer as serverPeerUrl was not set via setServerUrl function.')
            }
        }, () => {
            if (self.connectFailure) {
                self.connectFailure();
            }
        })

        this.signalingChannel.onServerConnected = (signalingServerUrl, selfPeerId) => {
            const selfPeerUrl = signalingServerUrl + '/' + selfPeerId
            self.selfSignalingServerUrlPeerIdMap.set(signalingServerUrl, selfPeerId)
            self.selfPeers.set(selfPeerUrl, new Peer(selfPeerUrl))
            self.debugLog('mesh adapter connected to signaling server ' + selfPeerUrl)
        }

        this.signalingChannel.onOffer = (signalingServerUrl, peerId, offer) => {
            return self.acceptOffer(signalingServerUrl, peerId, offer);
        }

        this.signalingChannel.onServerDisconnect = (signalingServerUrl) => {
            if (self.selfSignalingServerUrlPeerIdMap.has(signalingServerUrl)) {
                const selfPeerId = self.selfSignalingServerUrlPeerIdMap.get(signalingServerUrl)
                const selfPeerUrl = signalingServerUrl + '/' + selfPeerId
                self.selfPeers.delete(selfPeerUrl)
                self.selfSignalingServerUrlPeerIdMap.delete(signalingServerUrl)
                self.debugLog('mesh adapter disconnected from signaling server ' + selfPeerUrl)
            }
        }

        this.debugLog('--- mesh adapter connect ---')
    }

    disconnect() {
        const self = this
        this.channels.forEach((channel, peerUrl) => {
            self.closeStreamConnection(peerUrl)
        })
        this.signalingChannel.close()
    }

    shouldStartConnectionTo(clientId) {
        this.debugLog('--- mesh adapter should start connection to ---')
        // return TRUE if connections does not yet have clientId
        this.debugLog('--- mesh adapter should start connection to ---')
        return !this.connections.has(clientId)
    }

    startStreamConnection(clientId) {
        const self = this
        this.debugLog('--- mesh adapter start stream connection ---')
        const peer = new Peer(clientId)
        if (self.selfSignalingServerUrlPeerIdMap.has(peer.signalingServerUrl)) {
            const selfPeerId = self.selfSignalingServerUrlPeerIdMap.get(peer.signalingServerUrl)
            const selfPeerUrl = peer.signalingServerUrl + '/' + selfPeerId
            self.sendOffer(peer, selfPeerUrl).then();
        } else {
            self.signalingChannel.addServer(peer.signalingServerUrl, this.email, this.secret, async (signalServerUrl, selfPeerId) => {
                self.sendOffer(peer, signalServerUrl + '/' + selfPeerId).then();
            })
        }
        this.debugLog('--- mesh adapter start stream connection ---')
    }

    closeStreamConnection(clientId) {
        this.debugLog('--- mesh adapter close stream connection ---')
        if (this.channels.has(clientId)) {
            const channel = this.channels.get(clientId)
            this.channels.delete(clientId)
            channel.close()
            this.debugLog('mesh adapter removed channel ' + clientId)
            if (this.closedListener) {
                this.closedListener(clientId);
            }
        }
        if (this.connections.has(clientId)) {
            const connection = this.connections.get(clientId)
            this.connections.delete(clientId)
            this.signalingChannel.removeConnection(connection)
            connection.close()
            this.debugLog('mesh adapter removed connection ' + clientId)
        }
        if (this.peers.has(clientId) && this.peers.get(clientId)) {
            this.peers.set(clientId, false)
            this.notifyOccupantsChanged()
        }
        this.debugLog('--- mesh adapter close stream connection ---')
    }

    getConnectStatus(clientId) {
        this.debugLog('--- mesh adapter get connect status ---')
        if (this.channels.has(clientId)) {
            this.debugLog('--- mesh adapter get connect status ---')
            return 'IS_CONNECTED';
        } else {
            this.debugLog('--- mesh adapter get connect status ---')
            return'NOT_CONNECTED';
        }
    }

    sendData(clientId, dataType, data) {
        this.debugLog('--- mesh adapter send data ---')
        if (this.channels.has(clientId)) {
            this.channels.get(clientId).send(JSON.stringify(new DataMessage(dataType, data)))
        }
        this.debugLog('--- mesh adapter send data ---')
    }

    sendDataGuaranteed(clientId, dataType, data) {
        this.debugLog('--- mesh adapter send data guaranteed ---')
        this.sendData(clientId, dataType, data)
        this.debugLog('--- mesh adapter send data guaranteed ---')
    }


    broadcastData(dataType, data) {
        this.debugLog('--- mesh adapter broadcast data ---')
        this.channels.forEach(channel => {
            channel.send(JSON.stringify(new DataMessage(dataType, data)))
        })
        this.debugLog('--- mesh adapter broadcast data ---')
    }

    broadcastDataGuaranteed(dataType, data) {
        this.debugLog('--- mesh adapter broadcast data guaranteed ---')
        this.broadcastData(dataType, data)
        this.debugLog('--- mesh adapter broadcast data guaranteed ---')
    }

    // ### INTERNAL FUNCTIONS ###

    async offer(peer, selfPeerId) {
        const self = this
        const selfPeerUrl = self.signalingServerUrl + '/' + selfPeerId

        if (self.signalingChannel.clients.has(peer.signalingServerUrl)) {
            await this.delayedSendOffer(peer, selfPeerUrl);
        } else {
            self.signalingChannel.addServer(peer.signalingServerUrl, this.email, this.secret, async (signalServerUrl, selfPeerId) => {
                await this.delayedSendOffer(peer, selfPeerUrl);
            })
        }
    }

    async delayedSendOffer(peer, selfPeerUrl) {
        const self = this
        // TODO remove delayed connect created for test
        if (self.debugLogPrefix === "Sender") {
            setTimeout(async () => {
                await self.sendOffer(peer, selfPeerUrl);
            }, 1000)
        } else {
            await self.sendOffer(peer, selfPeerUrl);
        }
    }

    async sendOffer(peer, selfPeerUrl) {
        const self = this
        const connectionLabel = selfPeerUrl + ' -> ' + peer.peerUrl
        const connection = new self.RTCPeerConnection(self.configuration)
        self.connections.set(peer.peerUrl, connection)
        connection.oniceconnectionstatechange = function() {
            if(connection.iceConnectionState == 'disconnected') {
                self.closeStreamConnection(peer.peerUrl)
            }
        }

        const peerUrl = peer.peerUrl
        const channel = connection.createDataChannel(connectionLabel);

        this.setupChannel(channel, peerUrl);

        await self.signalingChannel.offer(peer.signalingServerUrl, peer.peerId, connection)
        this.debugLog('mesh adapter sent offer to ' + peer.peerUrl)
    }

    acceptOffer(signalinServerUrl, peerId, offer) {
        const self = this
        const peerUrl = signalinServerUrl + '/' + peerId
        const connection = new self.RTCPeerConnection(self.configuration)
        self.connections.set(peerUrl, connection)
        connection.oniceconnectionstatechange = function() {
            if(connection.iceConnectionState == 'disconnected') {
                self.closeStreamConnection(peerUrl)
            }
        }

        this.debugLog('mesh adapter received offer from ' + peerUrl)
        connection.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupChannel(channel, peerUrl);
        };
        return connection
    }

    setupChannel(channel, peerUrl) {
        const self = this
        channel.onopen = () => {
            self.channels.set(peerUrl, channel)
            if (self.openListener) {
                self.openListener(peerUrl);
            }
            if (!self.peers.has(peerUrl) || !self.peers.get(peerUrl)) {
                self.peers.set(peerUrl, true)
                self.broadcastPeer(peerUrl)
                self.notifyOccupantsChanged()
            }
            self.debugLog("channel " + channel.label + " opened")
        };
        channel.onclose = () => {
            if (self.channels.has(peerUrl)) {
                try {
                    self.closeStreamConnection(peerUrl)
                    self.debugLog("channel " + channel.label + " closed")
                } catch (error) {
                    console.warn("Error in onclose: " + error.message)
                }
            }
        };
        channel.onmessage = (event) => {
            self.debugLog("channel " + channel.label + " received message " + event.data + " from " + peerUrl)
            const message = JSON.parse(event.data)
            const from = peerUrl;
            const dataType = message.dataType;
            const data = message.data;

            if (dataType === 'PEER') {
                this.processReceivedPeer(data);
            } else {
                if (self.messageListener) {
                    self.messageListener(from, dataType, data);
                }
            }

        };
    }

    notifyOccupantsChanged() {
        this.roomOccupantListener(Array.from(this.peers).reduce((obj, [key, value]) => (
            Object.assign(obj, { [key]: value })
        ), {}))
    }

    processReceivedPeer(peerUrl) {
        const self = this
        self.debugLog('received peer: ' + peerUrl)
        if (peerUrl !== self.selfPeerUrl) {
            if (!self.peers.has(peerUrl) || !self.peers.get(peerUrl)) {
                self.debugLog('setting up peer: ' + peerUrl)
                self.broadcastPeer(peerUrl)
                self.sendConnectedPeers(peerUrl)
                self.sendOffer(new Peer(peerUrl), self.selfPeerUrl)
            }
        }
    }

    broadcastPeer(peerUrl) {
        const self = this
        self.debugLog('broadcasting peer : ' + peerUrl)
        self.peers.forEach((connected, connectedPeerUrl) => {
            if (connected && peerUrl !== connectedPeerUrl) {
                self.debugLog('sent peer: ' + peerUrl + ' to ' + connectedPeerUrl)
                self.sendData(connectedPeerUrl, 'PEER', peerUrl)
            }
        })
    }

    sendConnectedPeers(peerUrl) {
        const self = this
        self.debugLog('sending connected peers to: ' + peerUrl)
        self.peers.forEach((connected, connectedPeerUrl) => {
            if (connected && peerUrl !== connectedPeerUrl) {
                self.debugLog('sent peer: ' + connectedPeerUrl + ' to ' + peerUrl)
                self.sendData(peerUrl, 'PEER', connectedPeerUrl)
            }
        })
    }

    debugLog(message) {
        if (this.debugLogPrefix) {
            console.log(this.debugLogPrefix + ' ' + message)
        }
    }
}

if (typeof (NAF) !== 'undefined') {
// eslint-disable-next-line no-undef
    NAF.adapters.register("mesh", MeshAdapter);
}

exports.MeshAdapter = MeshAdapter;