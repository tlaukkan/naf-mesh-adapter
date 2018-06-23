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
        this.signalingServerUrl = null
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
            //this.email = document.title
            //this.secret = document.title
            //this.debugLogPrefix = document.title
        }

        this.manager = new PeerManager();
    }

    // ### INTERFACE FUNCTIONS ###

    setSignalServerUrl(signalServerUrl) {
        this.signalingServerUrl = signalServerUrl
    }

    setServerPeerUrls(serverPeerUrls) {
        this.serverPeerUrls = serverPeerUrls
        const serverPeelUrlArray = this.serverPeerUrls.split(',')
        if (!this.signalingServerUrl && serverPeelUrlArray.length > 0) {
            this.signalingServerUrl = new Peer(serverPeelUrlArray[0]).signalingServerUrl;
            this.debugLog('No signaling server URL set. Setting signaling server URL from first server peer URL: ' + this.signalingServerUrl)
        }
    }

    setServerUrl(serverPeerUrl) {
        if (serverPeerUrl) {
            this.setServerPeerUrls(serverPeerUrl)
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
        if (this.signalingServerUrl == null) {
            this.signalingServerUrl = 'wss://tlaukkan-webrtc-signaling.herokuapp.com';
            this.debugLog('No server peerl URL nor signaling server URL set. Setting default siganling server URL: ' + this.signalingServerUrl)
        }
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

    getServerTime() {
        return Date.now()
    }

    // ### INTERNAL FUNCTIONS ###

    openPeerConnection(peerUrl) {
        if (this.closed) { return }

        const peer = new Peer(peerUrl)
        if (this.selfSignalingServerUrlPeerIdMap.has(peer.signalingServerUrl)) {
            const selfPeerId = this.selfSignalingServerUrlPeerIdMap.get(peer.signalingServerUrl)
            const selfPeerUrl = peer.signalingServerUrl + '/' + selfPeerId
            this.sendOffer(peer, selfPeerUrl).then();
        } else {
            this.signalingChannel.addServer(peer.signalingServerUrl, this.email, this.secret, async (signalServerUrl, selfPeerId) => {
                this.sendOffer(peer, signalServerUrl + '/' + selfPeerId).then();
            })
        }
    }

    closePeerConnection(peerUrl) {
        const channel = this.channels.get(peerUrl)
        const connection = this.connections.get(peerUrl)

        this.debugLog('mesh adapter - close peer connection - closing...' + peerUrl)

        this.removePeer(peerUrl)

        if (connection) {
            this.connections.delete(peerUrl)
            this.signalingChannel.removeConnection(connection)
            connection.close()
            this.debugLog('rtc peer connection closed: ' + peerUrl);
            this.debugLog('mesh adapter - close peer connection - removed connection ' + peerUrl)
        }

        if (channel) {
            this.channels.delete(peerUrl)
            channel.close()
            this.debugLog('mesh adapter - close peer connection - closed channel' + peerUrl)
            if (this.onDataConnectionClosed) {
                this.onDataConnectionClosed(peerUrl);
            }
        }

    }

    async sendOffer(peer, selfPeerUrl) {
        if (this.closed) { return }

        const peerUrl = peer.peerUrl

        this.debugLog('mesh adapter - send offer: ' + peerUrl)

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

        this.debugLog('mesh adapter - send offer: ' + peerUrl)

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

        let connection
        if (this.connections.has(peerUrl)) {
            console.warn('rtc peer connect collision with, disconnecting: ' + peerUrl)
            this.closePeerConnection(peerUrl);
            return null;
        } else {
            connection = new this.RTCPeerConnectionImplementation(this.configuration)
            this.debugLog('rtc peer connection opened: ' + peerUrl);
            this.connections.set(peerUrl, connection)
            connection.oniceconnectionstatechange = () => {
                if (connection.iceConnectionState == 'disconnected' ||
                    connection.iceConnectionState == 'failed' ||
                    connection.iceConnectionState == 'closed') {
                    this.closePeerConnection(peerUrl)
                }
            }
            return connection;
        }

    }

    setupRtcDataChannel(channel, peerUrl) {
        if (this.closed) { return }

        this.debugLog('channel opened: ' + peerUrl)

        channel.onopen = () => {
            this.channels.set(peerUrl, channel)
            this.findChangedPeers(peerUrl)
            this.debugLog("channel " + channel.label + " opened")
        };
        channel.onclose = () => {
            if (this.channels.has(peerUrl)) {
                try {
                    this.closePeerConnection(peerUrl)
                    this.debugLog("channel " + channel.label + " closed")
                } catch (error) {
                    console.warn("Error in onclose: " + error.message)
                }
            }
        };
        channel.onmessage = (event) => {
            this.debugLog("channel " + channel.label + " received message " + event.data + " from " + peerUrl)
            const message = JSON.parse(event.data)
            const from = peerUrl;
            const dataType = message.dataType;
            const data = message.data;

            if (dataType === DataTypes.FIND_CHANGED_PEERS) {
                this.processFindChangedPeers(peerUrl, data)
            } else if (dataType === DataTypes.CHANGED_PEERS) {
                this.processChangedPeers(peerUrl, data)
            } else{
                if (this.onDataConnectionMessageReceived) {
                    //console.log('Data message ' + from + ' ' + dataType + ' ' + JSON.stringify(data));
                    this.onDataConnectionMessageReceived(from, dataType, data);
                }
            }

        };
    }

    // ### SIGNALING CHANNEL PROCESSING

    openPrimarySignalingServerConnection() {
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
            return this.processOffer(signalingServerUrl, peerId, offer);
        }

        this.signalingChannel.onServerDisconnect = (signalingServerUrl) => {
            this.processSignalingServerDisconnected(signalingServerUrl);
        }

        this.signalingChannel.onTargetNotFound = (signalingServerUrl, targetId) => {
            this.closePeerConnection(signalingServerUrl + '/' + targetId)
        }
    }

    closeAllConnections() {
        this.debugLog("mesh adapter - close all connections.")

        this.signalingChannel.close()

        this.connections.forEach((connection, peerUrl) => {
            this.closePeerConnection(peerUrl)
        })

    }

    async processPrimarySignalingServerConnected(signalingServerUrl, selfPeerId) {
        this.selfPeerUrl = signalingServerUrl + '/' + selfPeerId

        if (this.onServerConnected) {
            this.onServerConnected(this.selfPeerUrl);
        }

        if (this.serverPeerUrls && this.serverPeerUrls.length > 3) {
            this.serverPeerUrls.split(',').forEach(async serverPeerUrl => {
                await this.openPeerConnection(serverPeerUrl);
            })
        }

        this.selfPeerData = new PeerData(this.selfPeerUrl, PeerStatus.AVAILABLE, this.position)
        this.manager.peersChanged(this.selfPeerUrl, [this.selfPeerData])

        this.debugLog('mesh adapter: connected to primary signaling server.')
    }

    processPrimarySignalingServerConnectFailed() {
        if (this.onServerConnectFailed) {
            this.onServerConnectFailed();
        }
        console.error('mesh adapter:  primary signaling server connect failed.')
    }

    processSignalingServerConnected(signalingServerUrl, selfPeerId) {
        const selfPeerUrl = signalingServerUrl + '/' + selfPeerId
        this.selfSignalingServerUrlPeerIdMap.set(signalingServerUrl, selfPeerId)
        this.selfPeers.set(selfPeerUrl, new Peer(selfPeerUrl))
        this.debugLog('mesh adapter: connected to signaling server ' + selfPeerUrl)
    }

    processSignalingServerConnectFailed(signalingServerUrl) {
        console.error('mesh adapter: connect to signaling server failed: ' + signalingServerUrl)
    }

    processSignalingServerDisconnected(signalingServerUrl) {
        if (this.selfSignalingServerUrlPeerIdMap.has(signalingServerUrl)) {
            const selfPeerId = this.selfSignalingServerUrlPeerIdMap.get(signalingServerUrl)
            const selfPeerUrl = signalingServerUrl + '/' + selfPeerId
            this.selfPeers.delete(selfPeerUrl)
            this.selfSignalingServerUrlPeerIdMap.delete(signalingServerUrl)
            this.debugLog('mesh adapter: disconnected from signaling server ' + selfPeerUrl)
        }
    }

    // ### PEER PROCESSING

    findChangedPeers(peerUrl) {
        if (this.closed) { return }

        // Do not send this message to this.
        if (this.selfPeers.has(peerUrl)) {
            console.error('mesh adapter - find changed peers requested to be sent to this. Self identity from another signaling server?: ' + peerUrl)
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
            if (this.onDataConnectionOpened) {
                this.onDataConnectionOpened(peer.url);
            }

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
                if (!this.connections.has(peer.url)) {
                    this.sendOffer(new Peer(peer.url), this.selfPeerUrl).then().catch()
                } else {
                    this.debugLog('mesh adapter - process changed peers: peer rtc peer connection exists: ' + peerUrl)
                }
            }
        });
    }

    removePeer(peerUrl) {
        // TODO Add mapping for foreign signaling servers
        // Do not remove this.
        if (this.selfPeers.has(peerUrl)) {
            console.error('mesh adapter - remove peers at this. Self identity from another signaling server?: ' + peerUrl)
            return
        }

        if (this.manager.peers.has(peerUrl)) {
            this.debugLog("mesh adapter - remove peer: " + peerUrl);
            const currentPeers = this.manager.peersChanged(this.selfPeerUrl, [new PeerData(peerUrl, PeerStatus.UNAVAILABLE, new PeerPosition(0,0,0))]);
            // Flag changes known.
            this.manager.findPeersChanged(this.selfPeerData.url, this.selfPeerData.position, 100, 100)
            this.notifyPeersChanged(currentPeers);
        }
    }

    notifyPeersChanged(peers) {
        const peerMap = new Map()
        peers.forEach(peer => { peerMap.set(peer.url, peer.status === PeerStatus.AVAILABLE) });
        this.debugLog("Peers changed: " + peerMap.size)
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