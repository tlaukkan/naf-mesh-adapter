const signaling = require('./signaling-common');

const HandshakeRequest = signaling.HandshakeRequest
const HandshakeResponse = signaling.HandshakeResponse
const Message = signaling.Message

exports.SignalingClient = class {
    constructor(url, email, secret) {
        const self = this
        this.State = {
            CONNECTING: 'CONNECTING',
            CONNECTION_FAILED: 'CONNECTION_FAILED',
            CONNECTED: 'CONNECTED',
            DISCONNECTED: 'DISCONNECTED'
        };


        this.id = null
        this.email = email

        this.state = self.State.DISCONNECTED
        this.webSocket = null;

        this.send = (targetId, objectType, object) => {
            if (self.state != self.State.CONNECTED) {
                throw new Error("signaling client send() called when in state is not connected: " + self.state)
            }
            if (this.id) {
                const objectJson = JSON.stringify(object)
                //console.log('signaling client sent message ' + objectType + ' : ' + objectJson)
                self.webSocket.send(JSON.stringify(new Message(this.id, targetId, objectType, objectJson)))
            }
        }

        this.disconnect = () => {
            self.webSocket.close()
        }

        this.connect = () => {
            if (self.state != self.State.DISCONNECTED && self.state != self.State.CONNECTION_FAILED) {
                throw new Error("signaling client connect() called when in state is not disconnected or connection failed: " + self.state)
            }
            self.state = self.State.CONNECTING
            self.webSocket = new WebSocket(url, 'webrtc-signaling');
            //console.log('signaling client connecting ' + url)
        }

        this.onConnected = (id) => {

        }

        this.onConnectFailed = (error) => {

        }

        this.onConnectionError = () => {

        }

        this.onDisconnect = () => {

        }

        this.onReceive = (sourceId, objectType, object) => {

        }

        this.connect();

        this.webSocket.onerror = (error) => {
            if (this.id) {
                //console.log('signaling client connection error');
                self.onConnectionError(error)
                self.disconnect()
            } else {
                //console.log('signaling client connect failed');
                self.state = self.State.CONNECTION_FAILED
                self.onConnectFailed(error);
            }
        };

        this.webSocket.onclose = () => {
            //console.log('signaling client disconnected');
            self.state = self.State.DISCONNECTED
            self.onDisconnect();
        };

        this.webSocket.onopen = () => {
            //console.log('signaling client connected');
            //console.log('signaling client handshake started')
            self.webSocket.send(JSON.stringify(new HandshakeRequest(email, secret)))
        };

        this.webSocket.onmessage = (message) => {
            if (typeof message.data === 'string') {
                const messageObject = JSON.parse(message.data)
                if (messageObject.typeName === 'HandshakeResponse') {
                    if (messageObject.id) {
                        //console.log('signaling client handshake complete: ' + messageObject.id);
                        self.id = messageObject.id
                        self.state = self.State.CONNECTED
                        self.onConnected(messageObject.id);
                    } else {
                        console.log('signaling client handshake failed: ' + messageObject.error);
                        self.disconnect()
                        self.state = self.State.CONNECTION_FAILED
                    }
                }
                if (messageObject.typeName === 'Message') {
                    //console.log('signaling client received message : ' + messageObject.contentType + ' : ' + messageObject.contentJson + ' from ' + messageObject.sourceId)
                    self.onReceive(messageObject.sourceId, messageObject.contentType, JSON.parse(messageObject.contentJson));
                }
            }
        }

    }
}

