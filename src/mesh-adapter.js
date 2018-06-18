const SignalingChannel = require('@tlaukkan/webrtc-signaling').SignalingChannel;

const Peer = require('./mesh-adapter-model').Peer;
const DataMessage = require('./mesh-adapter-model').DataMessage;
const PeerStatus = require('./mesh-adapter-model').PeerStatus;
const PeerData = require('./mesh-adapter-model').PeerData;
const DataTypes = require('./mesh-adapter-model').DataTypes;
const FindChangedPeersMessage = require('./mesh-adapter-model').FindChangedPeersMessage;
const ChangedPeersMessage = require('./mesh-adapter-model').ChangedPeersMessage;
const PeerPosition = require('./mesh-adapter-model').PeerPosition;
const PeerManager = require('./peer-manager').PeerManager;

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

        this.position = new PeerPosition(0,0,0);

        //TODO Remove hack added for adapter test page
        if (typeof (document) !== 'undefined') {
            this.email = document.title
            this.secret = document.title
            this.debugLogPrefix = document.title
        }

        this.manager = new PeerManager();
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
        this.closeAllConnections();
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
        this.closePeerConnection(clientId);
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

    closePeerConnection(peerUrl) {
        const channel = this.channels.get(peerUrl)
        const connection = this.connections.get(peerUrl)

        this.removePeer(peerUrl)

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

        const connection = this.getRtcPeerConnection(peerUrl);

        if (connection) {
            const channel = connection.createDataChannel(selfPeerUrl + ' -> ' + peerUrl);
            this.setupRtcDataChannel(channel, peerUrl);

            this.signalingChannel.offer(peer.signalingServerUrl, peer.peerId, connection).then().catch()
            this.debugLog('mesh adapter sent offer to ' + peerUrl)
        }
    }

    processOffer(signalinServerUrl, peerId, offer) {
        if (this.closed) { return }

        const peerUrl = signalinServerUrl + '/' + peerId

        const connection = this.getRtcPeerConnection(peerUrl);
        if (connection) {
            connection.ondatachannel = (event) => {
                const channel = event.channel;
                this.setupRtcDataChannel(channel, peerUrl);
            };

            this.debugLog('mesh adapter accepted offer from ' + peerUrl)
        }

        return connection
    }

    getRtcPeerConnection(peerUrl) {
        if (this.closed) { return }
        const self = this

        let connection
        if (self.connections.has(peerUrl)) {
            console.warn('rtc peer connect collision with, disconnecting: ' + peerUrl)
            this.closePeerConnection(peerUrl);
            return null;
        } else {
            connection = new self.RTCPeerConnectionImplementation(self.configuration)
            self.connections.set(peerUrl, connection)
            connection.oniceconnectionstatechange = function () {
                if (connection.iceConnectionState == 'disconnected' ||
                    connection.iceConnectionState == 'failed' ||
                    connection.iceConnectionState == 'closed') {
                    self.closePeerConnection(peerUrl)
                }
            }
            return connection;
        }

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
            self.findChangedPeers(peerUrl)
            self.debugLog("channel " + channel.label + " opened")
        };
        channel.onclose = () => {
            if (self.channels.has(peerUrl)) {
                try {
                    self.closePeerConnection(peerUrl)
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

            if (dataType === DataTypes.FIND_CHANGED_PEERS) {
                self.processFindChangedPeers(peerUrl, data)
            } else if (dataType === DataTypes.CHANGED_PEERS) {
                self.processChangedPeers(peerUrl, data)
            } else{
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
            this.closePeerConnection(signalingServerUrl + '/' + targetId)
        }
    }

    closeAllConnections() {
        const self = this
        this.debugLog("mesh adapter - close all connections.")

        this.signalingChannel.close()

        this.connections.forEach((connection, peerUrl) => {
            self.closePeerConnection(peerUrl)
        })

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

        this.selfPeerData = new PeerData(self.selfPeerUrl, PeerStatus.AVAILABLE, self.position)
        this.manager.peersChanged(self.selfPeerUrl, [this.selfPeerData])

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

    findChangedPeers(peerUrl) {
        if (this.closed) { return }

        // Do not send this message to self.
        if (this.selfPeers.has(peerUrl)) {
            console.error('mesh adapter - find changed peers requested to be sent to self. Self identity from another signaling server?: ' + peerUrl)
            return
        }

        this.debugLog('mesh adapter - sending find changed peers to : ' + peerUrl)

        const findChangedPeersMessage = new FindChangedPeersMessage(this.selfPeerData, 100);
        this.sendData(peerUrl, DataTypes.FIND_CHANGED_PEERS, findChangedPeersMessage)
    }

    processFindChangedPeers(peerUrl, findChangedPeersMessage) {
        if (this.closed) { return }

        const peer = findChangedPeersMessage.peer;
        if (peer.status === PeerStatus.UNAVAILABLE) {
            console.warn('mesh adapter - find changed peers received with container peer being of status UNAVAILABLE.');
            return;
        }

        this.debugLog('mesh adapter - process find changed peers from : ' + peerUrl)

        // Manager does not yet contain peer then add it to manager and notify
        if (!this.manager.peers.has(peer.url)) {
            // Add changes to manager.
            const currentPeers = this.manager.peersChanged(this.selfPeerUrl, [peer]);
            // Flag changes known.
            this.manager.findPeersChanged(this.selfPeerData.url, this.selfPeerData.position, 100, 100)
            // Notify changes.
            this.notifyPeersChanged(currentPeers);
        }

        // Send changed peers to back to the peer.
        const changedPeersMessage = new ChangedPeersMessage(this.manager.findPeersChanged(peer.url, peer.position, findChangedPeersMessage.range));
        this.sendData(peerUrl, DataTypes.CHANGED_PEERS, changedPeersMessage)
    }

    processChangedPeers(peerUrl, changedPeers) {
        if (this.closed) { return }

        // Find out which peers were actually changed from peer manager perspective
        const actualChangedPeers = this.manager.peekChangedPeers(this.selfPeerData.url, this.selfPeerData.position, 100, changedPeers.peers)

        this.debugLog('mesh adapter - process changed peers self: ' + this.selfPeerUrl + ' from : ' + peerUrl + ' ' + JSON.stringify(actualChangedPeers))

        // Send offer to all peers which became available.
        actualChangedPeers.forEach(peer => {
            if (peer.status == PeerStatus.AVAILABLE) {
                this.sendOffer(new Peer(peer.url), this.selfPeerUrl).then().catch()
            }
        });
    }

    removePeer(peerUrl) {
        // TODO Add mapping for foreign signaling servers
        // Do not remove self.
        if (this.selfPeers.has(peerUrl)) {
            console.error('mesh adapter - remove peers at self. Self identity from another signaling server?: ' + peerUrl)
            return
        }

        if (this.manager.peers.has(peerUrl)) {
            this.debugLog("mesh adapter - remove peer: " + peerUrl);
            const currentPeers = this.manager.peersChanged(this.selfPeerUrl, [new PeerData(peerUrl, PeerStatus.UNAVAILABLE, new PeerPosition(0,0,0))]);
            this.notifyPeersChanged(currentPeers);
        }
    }

    notifyPeersChanged(peers) {
        const peerMap = new Map()
        peers.forEach(peer => { peerMap.set(peer.url, peer.status === PeerStatus.AVAILABLE) });
        this.onRoomOccupantsChanged(Array.from(peerMap).reduce((obj, [key, value]) => ( Object.assign(obj, {[key]: value}) ), {}));
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