const SignalingChannel = require('@tlaukkan/webrtc-signaling').SignalingChannel;

const Peer = require('./mesh-adapter-model').Peer
const DataMessage = require('./mesh-adapter-model').DataMessage

/**
 * Mesh Adapter
 *
 * NAF adapter Client ID corresponds to SignalChannel Peer URL.
 * Peer URL format is: '<signalingServerUrl>/<peerId>'
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
        this.connected = false
        // Boolean indicating if adapter has been closed.
        this.closed = false
        // The default app. Not in use currently.
        this.app = 'default'
        // The default room. Not in use currently.
        this.room = 'default';

        // Callback for server connection success.
        this.onServerConnected = null
        // Callback for server connection failure.
        this.onServerConnectFailed = null
        // Callback for room occupants changed.
        this.onRoomOccupantsChanged = null
        // Callback for data connection open
        this.onDataConnectionOpened = null
        // Callback for data connection close
        this.onDataConnectionClosed = null
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
        if (serverPeerUrl) { this.serverPeerUrls = serverPeerUrl; }
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
        this.onServerConnected = successListener;
        this.onServerConnectFailed = failureListener;
    }

    setRoomOccupantListener(occupantListener) {
        this.onRoomOccupantsChanged = occupantListener;
    }

    setDataChannelListeners(openListener, closedListener, messageListener) {
        this.onDataConnectionOpened = openListener;
        this.onDataConnectionClosed = closedListener;
        this.onDataConnectionMessageReceived = messageListener;
    }

    connect() {
        if (this.connected) { throw Error('mesh adapter - connect: already connected.') } else { this.connected = true }
        this.openPrimarySignalingServerConnection();
    }

    disconnect() {
        if (this.closed) { return } else { this.closed = true }
        this.closeSignalingServerConnection();
    }

    shouldStartConnectionTo(clientId) {
        if (this.closed) { return }
        return !this.connections.has(clientId)
    }

    startStreamConnection(clientId) {
        if (this.closed) { return }
        this.openPeerConnection(clientId);
    }

    closeStreamConnection(clientId) {
        this.closerPeerConnection(clientId);
    }

    getConnectStatus(clientId) {
        if (this.channels.has(clientId)) { return 'IS_CONNECTED'; } else { return'NOT_CONNECTED'; }
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

    openPeerConnection(peerUrl) {
        if (this.closed) { return }

        const self = this

        const peer = new Peer(peerUrl)
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

    // TODO Remove delayed sending done for naf adapter testing page.
    async delayedOpenPeerConnection(peerUrl) {
        if (this.closed) { return }

        const self = this

        const peer = new Peer(peerUrl)
        if (self.signalingChannel.clients.has(peer.signalingServerUrl)) {
            const selfPeerId = self.selfSignalingServerUrlPeerIdMap.get(peer.signalingServerUrl)
            const selfPeerUrl = peer.signalingServerUrl + '/' + selfPeerId
            await this.delayedSendOffer(peer, selfPeerUrl);
        } else {
            self.signalingChannel.addServer(peer.signalingServerUrl, this.email, this.secret, async (signalServerUrl, selfPeerId) => {
                await this.delayedSendOffer(peer, signalServerUrl + '/' + selfPeerId);
            })
        }
    }

    closerPeerConnection(peerUrl) {
        const channel = this.channels.get(peerUrl)
        const connection = this.connections.get(peerUrl)

        if (this.peers.has(peerUrl) && this.peers.get(peerUrl)) {
            this.peers.set(peerUrl, false)
            this.notifyOccupantsChanged()
        }

        if (channel) {
            this.channels.delete(peerUrl)
            channel.close()
            this.debugLog('channel closed: ' + peerUrl)
            this.debugLog('mesh adapter removed channel ' + peerUrl)
            if (this.onDataConnectionClosed) {
                this.onDataConnectionClosed(peerUrl);
            }
        }

        if (connection) {
            this.connections.delete(peerUrl)
            this.signalingChannel.removeConnection(connection)
            connection.close()
            this.debugLog('connection closed: ' + peerUrl)
            this.debugLog('mesh adapter removed connection ' + peerUrl)
        }
    }

    // TODO Remove delayed sending done for naf adapter testing page.
    async delayedSendOffer(peer, selfPeerUrl) {
        if (this.closed) { return }

        const self = this
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

        if (this.connections.has(peerUrl)) {
            console.log('mesh adapter - send offer : already connected to peer: ' + peerUrl)
            return
        }

        const connection = this.createRtcPeerConnection(peerUrl);

        const channel = connection.createDataChannel(selfPeerUrl + ' -> ' + peerUrl);
        this.setupRtcDataChannel(channel, peerUrl);

        await this.signalingChannel.offer(peer.signalingServerUrl, peer.peerId, connection)
        this.debugLog('mesh adapter sent offer to ' + peerUrl)
    }

    processOffer(signalinServerUrl, peerId, offer) {
        if (this.closed) { return }

        const peerUrl = signalinServerUrl + '/' + peerId

        if (this.connections.has(peerUrl)) {
            console.log('mesh adapter - process offer : already connected to peer: ' + peerUrl)
            return
        }

        const connection = this.createRtcPeerConnection(peerUrl);

        connection.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupRtcDataChannel(channel, peerUrl);
        };

        this.debugLog('mesh adapter accepted offer from ' + peerUrl)

        return connection
    }

    createRtcPeerConnection(peerUrl) {
        if (this.closed) { return }
        const self = this

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

    setupRtcDataChannel(channel, peerUrl) {
        if (this.closed) { return }
        const self = this

        this.debugLog('channel opened: ' + peerUrl)

        channel.onopen = () => {
            self.channels.set(peerUrl, channel)
            if (self.onDataConnectionOpened) {
                self.onDataConnectionOpened(peerUrl);
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

    // ### SIGNALING CHANNEL PROCESSING

    openPrimarySignalingServerConnection() {
        const self = this
        this.signalingChannel.addServer(this.signalingServerUrl, this.email, this.secret, async (signalingServerUrl, selfPeerId) => {
            await this.processPrimarySignalingServerConnected(signalingServerUrl, selfPeerId);
        }, () => {
            this.processPrimarySignalingServerConnectFailed();
        })

        this.signalingChannel.onServerConnected = (signalingServerUrl, selfPeerId) => {
            this.processSignalingServerConnected(signalingServerUrl, selfPeerId);
        }

        this.signalingChannel.onServerConnectFailed = (error, signalingServerUrl) => {
            this.processSignalingServerConnectFailed(signalingServerUrl);
        }

        this.signalingChannel.onOffer = (signalingServerUrl, peerId, offer) => {
            return self.processOffer(signalingServerUrl, peerId, offer);
        }

        this.signalingChannel.onServerDisconnect = (signalingServerUrl) => {
            this.processSignalingServerDisconnected(signalingServerUrl);
        }

        this.signalingChannel.onTargetNotFound = (signalingServerUrl, targetId) => {
            this.closerPeerConnection(signalingServerUrl + '/' + targetId)
        }
    }

    closeSignalingServerConnection() {
        const self = this

        this.channels.forEach((channel, peerUrl) => {
            self.closeStreamConnection(peerUrl)
        })
        this.signalingChannel.close()
    }

    async processPrimarySignalingServerConnected(signalingServerUrl, selfPeerId) {
        const self = this
        self.selfPeerUrl = signalingServerUrl + '/' + selfPeerId

        if (self.onServerConnected) {
            self.onServerConnected(self.selfPeerUrl);
        }

        if (self.serverPeerUrls && self.serverPeerUrls.length > 3) {
            self.serverPeerUrls.split(',').forEach(async serverPeerUrl => {
                await self.delayedOpenPeerConnection(serverPeerUrl);
            })
        }

        self.debugLog('mesh adapter: connected to primary signaling server.')
    }

    processPrimarySignalingServerConnectFailed() {
        if (this.onServerConnectFailed) {
            this.onServerConnectFailed();
        }
        console.error('mesh adapter:  primary signaling server connect failed.')
    }

    processSignalingServerConnected(signalingServerUrl, selfPeerId) {
        const self = this
        const selfPeerUrl = signalingServerUrl + '/' + selfPeerId
        self.selfSignalingServerUrlPeerIdMap.set(signalingServerUrl, selfPeerId)
        self.selfPeers.set(selfPeerUrl, new Peer(selfPeerUrl))
        self.debugLog('mesh adapter: connected to signaling server ' + selfPeerUrl)
    }

    processSignalingServerConnectFailed(signalingServerUrl) {
        console.error('mesh adapter: connect to signaling server failed: ' + signalingServerUrl)
    }

    processSignalingServerDisconnected(signalingServerUrl) {
        const self = this
        if (self.selfSignalingServerUrlPeerIdMap.has(signalingServerUrl)) {
            const selfPeerId = self.selfSignalingServerUrlPeerIdMap.get(signalingServerUrl)
            const selfPeerUrl = signalingServerUrl + '/' + selfPeerId
            self.selfPeers.delete(selfPeerUrl)
            self.selfSignalingServerUrlPeerIdMap.delete(signalingServerUrl)
            self.debugLog('mesh adapter: disconnected from signaling server ' + selfPeerUrl)
        }
    }

    // ### PEER PROCESSING
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

    notifyOccupantsChanged() {
        if (this.closed) { return }

        this.onRoomOccupantsChanged(Array.from(this.peers).reduce((obj, [key, value]) => (
            Object.assign(obj, { [key]: value })
        ), {}))
    }

    // ### UTILITY METHODS

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