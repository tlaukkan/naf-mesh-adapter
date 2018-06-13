const SignalingClient = require('./signaling-client').SignalingClient;

exports.SignalingChannel = class {

    constructor() {
        const self = this

        this.ObjectType = {
            OFFER: 'OFFER',
            ANSWER: 'ANSWER',
            ICE_CANDIDATE: 'ICE_CANDIDATE'
        };

        // Map of server URLs and SignalingClients
        this.clients = new Map()
        // Map of server URLs and onServerConnectedCallbacks
        this.onServerConnectedCallbacks = new Map()
        // RTC peer connections
        this.connections = new Map()

        this.onOffer = (signalingServeUrl, peerId, offer) => {
            throw new Error("onOffer has to be overridden with implementation of returning new RTCPeeringConnection(configuration).");
        }

        // On listen for RTC peer connections.
        this.onServerConnected = (signalingServeUrl, selfPeerId) => {
        }

        this.onServerConnectFailed = (error, signalingServeUrl) => {
        }

        this.onServerDisconnect = (signalingServeUrl) => {
        }

        this.onServerConnectionError = (signalingServeUrl) => {
        }

        // Closes the signaling channel.
        this.close = () => {
            this.clients.forEach(value => {
              value.disconnect()
            })
        }

        this.removeConnection = (connection) => {
            this.connections.forEach((value, key) => {
                if (value === connection) {
                    this.connections.delete(key)
                }
            })
        }

        this.removeServer = (url) => {
            if (self.clients.has(url)) {
                if (self.clients.get(url).state = self.clients.get(url).State.CONNECTED) {
                    self.clients.get(url).disconnect()
                }
                self.clients.delete(url)
            }
            if (self.onServerConnectedCallbacks.has(url)) {
                self.onServerConnectedCallbacks.delete(url)
            }
            self.connections.forEach((value, key) => {
                if (key.startsWith(url)) {
                    self.connections.delete(key)
                }
            })
        }

        // Start listening for RTC peer connections.
        this.addServer = (url, email, secret, connectedCallback, connectFailedCallback) => {

            if (connectedCallback) {
                self.onServerConnectedCallbacks.set(url, connectedCallback)
            }

            const client = new SignalingClient(url, email, secret);
            self.clients.set(url, client)

            client.onConnected = (id) => {
                self.onServerConnected(url, id)
                if (self.onServerConnectedCallbacks.has(url)) {
                    const onServerConnectedCallback  = self.onServerConnectedCallbacks.get(url)
                    if (onServerConnectedCallback) {
                        onServerConnectedCallback(url, id)
                    }
                    self.onServerConnectedCallbacks.delete(url)
                }
            }

            client.onConnectFailed = (error) => {
                console.log('Connect failed.')
                if (connectFailedCallback) {
                    connectFailedCallback(error)
                }
                self.onServerConnectFailed(error, url)
            }

            client.onReceive = async (sourceId, objectType, object) => {

                try {
                    if (objectType === self.ObjectType.OFFER) {
                        const connection = self.onOffer(url, sourceId, object)

                        self.connections.set(url + '/' + client.id + "-" + sourceId, connection)

                        connection.onicecandidate = async (candidate) => {
                            client.send(sourceId, self.ObjectType.ICE_CANDIDATE, candidate.candidate)
                        };

                        await connection.setRemoteDescription(object)
                        await connection.setLocalDescription(await connection.createAnswer())
                        client.send(sourceId, self.ObjectType.ANSWER, connection.localDescription)
                    }

                    if (objectType === self.ObjectType.ANSWER) {
                        const connection = self.connections.get(url + '/' + client.id + "-" + sourceId)
                        await connection.setRemoteDescription(object)
                    }

                    if (objectType === self.ObjectType.ICE_CANDIDATE) {
                        if (object) {
                            const connection = self.connections.get(url + '/' + client.id + "-" + sourceId)
                            connection.addIceCandidate(object)
                        }
                    }
                } catch(error) {
                    console.log("rtc peer error processing received object " + objectType + " " + JSON.stringify(object) + ":" + error.message)
                    throw new Error("rtc peer error processing received object " + objectType + " " + JSON.stringify(object) + ":" + error.messag)
                }

            }

            client.onDisconnect = () => {
                self.onServerDisconnect(url)
                // Reconnect after 10 seconds.
                setTimeout(() => {
                    client.connect()
                }, 10000)
            }

            client.onConnectionError = () => {
                self.onServerConnectionError(url)
            }

        }

        // Send offer to RTC peer
        this.offer = async (signalingServerUrl, peerId, connection) => {
            try {
                let client = self.clients.get(signalingServerUrl)
                await self.waitForClientToConnect(client)

                self.connections.set(signalingServerUrl + '/' + client.id + "-" + peerId, connection)

                connection.onicecandidate = async (candidate) => {
                    client.send(peerId, self.ObjectType.ICE_CANDIDATE, candidate.candidate)
                };

                connection.createOffer().then(async (offer) => {
                    try {
                        await connection.setLocalDescription(offer);
                        client.send(peerId, self.ObjectType.OFFER, connection.localDescription)
                    } catch(error) {
                        console.log(error.message)
                    }
                })
            } catch(error) {
                console.log("rtc peer error sending offer: " + error.message)
                throw new Error("rtc peer error sending offer: " + error.message)
            }
        }

        this.waitForClientToConnect = async (client) => {
            if (!client) {
                throw new Error("Not connected to signaling server.")
            }

            let i = 0;
            while (client.state !== client.State.CONNECTED) {
                //console.log("offer waiting for client to connect...")
                await timeout(100)
                i++
                if (i>50) {
                    console.log("Waiting for client to connect timed out: " + signalingServerUrl)
                    throw new Error("Waiting for client to connect timed out: " + signalingServerUrl)
                }
            }
        }

    }

}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
