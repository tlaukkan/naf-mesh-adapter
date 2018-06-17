const SignalingChannel = require('@tlaukkan/webrtc-signaling').SignalingChannel;

const Peer = require('./mesh-model').Peer
const DataMessage = require('./mesh-model').DataMessage

/**
 * Mesh Adapter
 *
 * Peer URLs structure is: '<signalingServerUrl>/<peerId>'
 */
class MeshAdapter {

    constructor(RTCPeerConnectionImplementation, WebSocketImplementation) {
        // Deduce WebRTC peer connection implementation.
        if (RTCPeerConnectionImplementation) {
            this.RTCPeerConnectionImplementation = RTCPeerConnectionImplementation
        } else {
            this.RTCPeerConnectionImplementation = RTCPeerConnection
        }

        // Deduce WebSocketImplementation
        if (WebSocketImplementation) {
            this.WebSocketImplementation = WebSocketImplementation
        } else {
            this.WebSocketImplementation = WebSocket
        }

        // Boolean indicating if adapter has been opened.
        this.opened = false
        // Boolean indicating if adapter has been closed.
        this.closed = false
        // The default app. Not in use currently.
        this.app = 'default'
        // The default room. Not in use currently.
        this.room = 'default';

        // Callback for server connection success.
        this.onServerConnectSuccess = null
        // Callback for server connection failure.
        this.onServerConnectFailure = null
        // Callback for room occupants changed.
        this.onRoomOccupantsChanged = null
        // Callback for data connection open
        this.onDataConnectionOpen = null
        // Callback for data connection close
        this.onDataConnectionClose = null
        // Callback for data connection message received
        this.onDataConnectionMessageReceived = null


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
        this.signalingChannel = new SignalingChannel(this.WebSocketImplementation)
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
    }

    // ### INTERFACE FUNCTIONS ###

    setSignalServerUrl(signalServerUrl) {
        this.signalingServerUrl = signalServerUrl
    }

    setServerPeerUrls(serverPeerUrls) {
        this.serverPeerUrls = serverPeerUrls
    }

    setServerUrl(serverPeerUrl) {
        this.debugLog('set server URL to server peer URL: ' + serverPeerUrl)
        if (serverPeerUrl) {
            this.serverPeerUrls = serverPeerUrl;
        }
    }

    setApp(appName) {
        this.app = appName;
    }

    setRoom(roomName) {
        this.room = roomName;
    }

    setWebRtcOptions(options) {
        this.options = options
    }

    setServerConnectListeners(successListener, failureListener) {
        this.onServerConnectSuccess = successListener;
        this.onServerConnectFailure = failureListener;
    }

    setRoomOccupantListener(occupantListener) {
        this.onRoomOccupantsChanged = occupantListener;
    }

    setDataChannelListeners(openListener, closedListener, messageListener) {
        this.onDataConnectionOpen = openListener;
        this.onDataConnectionClose = closedListener;
        this.onDataConnectionMessageReceived = messageListener;
    }

    connect() {
        if (this.opened) { throw Error('mesh adapter - connect: already connected.') }
        const self = this

        this.opened = true

        this.signalingChannel.addServer(this.signalingServerUrl, this.email, this.secret, async (signalServerUrl, selfPeerId) => {
            self.selfPeerUrl = signalServerUrl + '/' + selfPeerId
            if (self.onServerConnectSuccess) {
                self.onServerConnectSuccess(self.selfPeerUrl);
            }
            if (self.serverPeerUrls && self.serverPeerUrls.length > 3) {
                self.serverPeerUrls.split(',').forEach(async serverPeerUrl => {
                    await self.offer(new Peer(serverPeerUrl), selfPeerId);
                })
            }
        }, () => {
            if (self.onServerConnectFailure) {
                self.onServerConnectFailure();
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
    }

    disconnect() {
        if (this.closed) { return }

        const self = this
        this.closed = true
        this.channels.forEach((channel, peerUrl) => {
            self.closeStreamConnection(peerUrl)
        })
        this.signalingChannel.close()
    }

    shouldStartConnectionTo(clientId) {
        if (this.closed) { return }

        return !this.connections.has(clientId)
    }

    startStreamConnection(clientId) {
        if (this.closed) { return }
        const self = this

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
    }

    closeStreamConnection(clientId) {
        const channel = this.channels.get(clientId)
        const connection = this.connections.get(clientId)

        if (channel) {
            this.channels.delete(clientId)
            channel.close()
            this.debugLog('channel closed: ' + clientId)
            this.debugLog('mesh adapter removed channel ' + clientId)
            if (this.onDataConnectionClose) {
                this.onDataConnectionClose(clientId);
            }
        }

        if (connection) {
            this.connections.delete(clientId)
            this.signalingChannel.removeConnection(connection)
            connection.close()
            this.debugLog('connection closed: ' + clientId)
            this.debugLog('mesh adapter removed connection ' + clientId)
        }

        if (this.peers.has(clientId) && this.peers.get(clientId)) {
            this.peers.set(clientId, false)
            this.notifyOccupantsChanged()
        }
    }

    getConnectStatus(clientId) {
        if (this.channels.has(clientId)) {
            return 'IS_CONNECTED';
        } else {
            return'NOT_CONNECTED';
        }
    }

    sendData(clientId, dataType, data) {
        if (this.closed) { return }

        if (this.channels.has(clientId)) {
            this.channels.get(clientId).send(JSON.stringify(new DataMessage(dataType, data)))
        }
    }

    sendDataGuaranteed(clientId, dataType, data) {
        if (this.closed) { return }

        this.sendData(clientId, dataType, data)
    }


    broadcastData(dataType, data) {
        if (this.closed) { return }

        this.channels.forEach(channel => {
            channel.send(JSON.stringify(new DataMessage(dataType, data)))
        })
    }

    broadcastDataGuaranteed(dataType, data) {
        if (this.closed) { return }

        this.broadcastData(dataType, data)
    }

    // ### INTERNAL FUNCTIONS ###

    async offer(peer, selfPeerId) {
        if (this.closed) { return }

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
        if (this.closed) { return }

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
        if (this.closed) { return }

        const peerUrl = peer.peerUrl
        const connection = this.createRTCPeerConnection(peerUrl);

        const channel = connection.createDataChannel(selfPeerUrl + ' -> ' + peerUrl);
        this.setupChannel(channel, peerUrl);

        await this.signalingChannel.offer(peer.signalingServerUrl, peer.peerId, connection)
        this.debugLog('mesh adapter sent offer to ' + peerUrl)
    }

    acceptOffer(signalinServerUrl, peerId, offer) {
        if (this.closed) { return }

        const peerUrl = signalinServerUrl + '/' + peerId
        const connection = this.createRTCPeerConnection(peerUrl);

        connection.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupChannel(channel, peerUrl);
        };

        this.debugLog('mesh adapter accepted offer from ' + peerUrl)

        return connection
    }

    createRTCPeerConnection(peerUrl) {
        if (this.closed) { return }
        const self = this

        if (self.connections.has(peerUrl)) {
            throw Error('mesh adapter - accept offer : already connected to peer: ' + peerUrl)
        }
        const connection = new self.RTCPeerConnectionImplementation(self.configuration)
        this.debugLog('connection created: ' + peerUrl)
        self.connections.set(peerUrl, connection)
        connection.oniceconnectionstatechange = function () {
            if (connection.iceConnectionState == 'disconnected') {
                self.closeStreamConnection(peerUrl)
            }
        }
        return connection;
    }

    setupChannel(channel, peerUrl) {
        if (this.closed) { return }
        const self = this

        this.debugLog('channel opened: ' + peerUrl)

        channel.onopen = () => {
            self.channels.set(peerUrl, channel)
            if (self.onDataConnectionOpen) {
                self.onDataConnectionOpen(peerUrl);
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
                if (self.onDataConnectionMessageReceived) {
                    self.onDataConnectionMessageReceived(from, dataType, data);
                }
            }

        };
    }

    notifyOccupantsChanged() {
        if (this.closed) { return }

        this.onRoomOccupantsChanged(Array.from(this.peers).reduce((obj, [key, value]) => (
            Object.assign(obj, { [key]: value })
        ), {}))
    }

    processReceivedPeer(peerUrl) {
        if (this.closed) { return }

        const self = this
        self.debugLog('received peer: ' + peerUrl)
        if (peerUrl !== self.selfPeerUrl) {
            if (!self.peers.has(peerUrl) || !self.peers.get(peerUrl)) {
                self.debugLog('setting up peer: ' + peerUrl)
                self.broadcastPeer(peerUrl)
                self.sendConnectedPeers(peerUrl)
                self.sendOffer(new Peer(peerUrl), self.selfPeerUrl).then().catch()
            }
        }
    }

    broadcastPeer(peerUrl) {
        if (this.closed) { return }

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
        if (this.closed) { return }

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
            this.debugLog(this.debugLogPrefix + ' ' + message)
        }
    }
}

if (typeof (NAF) !== 'undefined') {
// eslint-disable-next-line no-undef
    NAF.adapters.register("mesh", MeshAdapter);
}

exports.MeshAdapter = MeshAdapter;