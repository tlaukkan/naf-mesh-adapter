const SignalingChannel = require('./signaling-channel').SignalingChannel;

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
 */
class MeshAdapter {

    constructor() {
        this.debugLog('--- mesh adapter constructor ---')

        this.debugLogPrefix = null
        this.email = Date.now().toString();
        this.secret = Date.now().toString();

        //TODO Remove hack added for adapter testing
        if (typeof (document) !== 'undefined') {
            this.debugLogPrefix = document.title
            this.email = document.title
            this.secret = document.title
        }

        // Peer URLs structure is: '<signalingServerUrl>/<peerId>'

        // Initial peer URL or null if this is lone server node.
        this.selfPeerUrl = null
        this.initialPeerUrl = null
        this.configuration = {iceServers: [{urls: 'stun:stun1.l.google.com:19302'}]};
        this.signalingServerUrl = 'wss://tlaukkan-webrtc-signaling.herokuapp.com'

        this.room = "default";

        this.signalingChannelOne = new SignalingChannel()
        // Map of signaling server URLs and peer IDs
        this.selfPeerIds = new Map()
        // Map of peer URL and RTC Peer Connections
        this.connections = new Map()
        // Map of peer URL and RTC Data Channels
        this.channels = new Map()

        this.debugLog('--- mesh adapter constructor ---')

    }
    
    debugLog(message) {
        if (this.debugLogPrefix) {
            console.log(this.debugLogPrefix + ' ' + message)
        }
    }

    // ### INTERFACE FUNCTIONS ###

    setServerUrl(initialPeerUrl) {
        this.debugLog('--- mesh adapter set server url ---')
        this.debugLog('set server URL to first peer URL to: ' + initialPeerUrl)
        if (initialPeerUrl) {
            this.initialPeerUrl = initialPeerUrl;
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

        this.signalingChannelOne.addServer(this.signalingServerUrl, this.email, this.secret, async (signalServerUrl, selfPeerId) => {
            self.selfPeerUrl = signalServerUrl + '/' + selfPeerId
            if (self.initialPeerUrl && self.initialPeerUrl.length > 3) {
                await self.offer(new Peer(self.initialPeerUrl), selfPeerId);
                self.connectSuccess(self.selfPeerUrl);
            } else {
                this.debugLog('mesh adapter did not send offer as initialPeerUrl was not set via setServerUrl function.')
                self.connectSuccess(self.selfPeerUrl);
            }
        }, () => {
            self.connectFailure();
        })

        this.signalingChannelOne.onServerConnected = async (signalingServerUrl, selfPeerId) => {
            self.selfPeerIds.set(signalingServerUrl, selfPeerId)
            this.debugLog('mesh adapter connected to signaling server ' + signalingServerUrl + '/' + selfPeerId)
        }

        this.signalingChannelOne.onOffer = (signalingServerUrl, peerId, offer) => {
            return self.acceptOffer(signalingServerUrl, peerId, offer);
        }

        this.debugLog('--- mesh adapter connect ---')
    }

    disconnect() {
        self = this
        this.channels.forEach((channel, peerUrl) => {
            self.closeStreamConnection(peerUrl)
        })
        this.signalingChannelOne.close()
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
        if (self.selfPeerIds.has(peer.signalingServerUrl)) {
            const selfPeerId = self.selfPeerIds.get(peer.signalingServerUrl)
            const selfPeerUrl = peer.signalingServerUrl + '/' + selfPeerId
            self.sendOffer(peer, selfPeerUrl);
        } else {
            self.signalingChannelOne.addServer(peer.signalingServerUrl, this.email, this.secret, async (signalServerUrl, selfPeerId) => {
                self.sendOffer(peer, signalServerUrl + '/' + selfPeerId);
            })
        }
        this.debugLog('--- mesh adapter start stream connection ---')
    }

    closeStreamConnection(clientId) {
        this.debugLog('--- mesh adapter close stream connection ---')
        if (this.channels.has(clientId)) {
            const channel = this.channels.get(clientId)
            channel.close()
            this.channels.delete(channel)
            this.debugLog('mesh adapter removed channel' + clientId)
        }
        if (this.connections.has(clientId)) {
            const connection = this.connections.get(clientId)
            this.signalingChannelOne.removeConnection(connection)
            connection.close()
            this.connections.delete(clientId)
            this.debugLog('mesh adapter removed connection' + clientId)
        }
        this.closedListener(clientId);
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

        if (self.signalingChannelOne.clients.has(peer.signalingServerUrl)) {
            await this.delayedSendOffer(peer, selfPeerUrl);
        } else {
            self.signalingChannelOne.addServer(peer.signalingServerUrl, this.email, this.secret, async (signalServerUrl, selfPeerId) => {
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
        const connection = new RTCPeerConnection(self.configuration)
        self.connections.set(peer.peerUrl, connection)
        const channel = connection.createDataChannel(connectionLabel);

        channel.onopen = () => {
            self.channels.set(peer.peerUrl, channel)
            this.openListener(peer.peerUrl);
            self.notifyReceivedOccupants([peer.peerUrl])
            this.debugLog("channel " + channel.label + " opened")
        };
        channel.onclose = () => {
            this.closeStreamConnection(peer.peerUrl)
            this.debugLog("channel " + channel.label + " closed")
        };
        channel.onmessage = (event) => {
            this.debugLog("channel " + channel.label + " received message " + event.data + " from " + peer.peerUrl)
            const message = JSON.parse(event.data)
            const from = peer.peerUrl;
            const dataType = message.dataType;
            const data = message.data;
            self.messageListener(from, dataType, data);
        };

        await self.signalingChannelOne.offer(peer.signalingServerUrl, peer.peerId, connection)
        this.debugLog('mesh adapter sent offer to ' + peer.peerUrl)
    }

    acceptOffer(signalinServerUrl, peerId, offer) {
        const self = this
        const peerUrl = signalinServerUrl + '/' + peerId
        const connection = new RTCPeerConnection(self.configuration)
        self.connections.set(peerUrl, connection)
        this.debugLog('mesh adapter received offer from ' + peerUrl)
        connection.ondatachannel = (event) => {
            const channel = event.channel;
            channel.onopen = () => {
                self.channels.set(peerUrl, channel)
                this.openListener(peerUrl);
                self.notifyReceivedOccupants([peerUrl])
                this.debugLog("channel " + channel.label + " opened")
            };
            channel.onclose = () => {
                this.closeStreamConnection(peerUrl)
                this.debugLog("channel " + channel.label + " closed")
            };
            channel.onmessage = (event) => {
                this.debugLog("channel " + channel.label + " received message " + event.data + " from " + peerUrl)
                const message = JSON.parse(event.data)
                const from = peerUrl;
                const dataType = message.dataType;
                const data = message.data;
                self.messageListener(from, dataType, data);
            };
        };
        return connection
    }

    notifyReceivedOccupants(occupants) {
        const occupantMap = {};
        for (let i = 0; i < occupants.length; i++) {
            occupantMap[occupants[i]] = true;
        }
        this.roomOccupantListener(occupantMap);
    }

}


if (typeof (NAF) !== 'undefined') {
    NAF.adapters.register("mesh", MeshAdapter);
}

exports.MeshAdapter = MeshAdapter;