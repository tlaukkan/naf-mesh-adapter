// eslint-disable-next-line no-unused-vars
const assert = require('assert');

const WebSocketImplementation = (typeof (WebSocket) !== 'undefined') ? WebSocket : require('websocket').w3cwebsocket
const RTCPeerConnectionImplementation = (typeof (RTCPeerConnection) !== 'undefined') ? RTCPeerConnection : require('wrtc').RTCPeerConnection

const MeshAdapter = require('../../src/mesh-adapter').MeshAdapter;

describe('naf-mesh-server-peer-remote-test.js', function() {

    /*
    it('should connect to remote server peer at localhost and receive occupant', function(done) {
        this.timeout(20000);
        const adapter1 = new MeshAdapter(RTCPeerConnectionImplementation, WebSocketImplementation);
        adapter1.setSignalServerUrl('wss://tlaukkan-webrtc-signaling.herokuapp.com');
        adapter1.email = 'adapter1';
        adapter1.secret = 'adapter1';
        adapter1.setServerUrl('wss://tlaukkan-webrtc-signaling.herokuapp.com/33a1c3f9bfb4cf146be142eedfb8b4c7cd77f1ee47d9da2afcd9d30c81c3fe48');
        adapter1.connect();

        adapter1.setServerConnectListeners((id) => {
            console.log('adapter connected to server and got id: ' + id)
        }, () => {
            console.log('adapter server connect failed')
        })

        var isDone = false
        adapter1.setRoomOccupantListener((occupantMap) => {
            console.log('adapter 1 occupant change: ' + JSON.stringify(occupantMap))
            if (Object.keys(occupantMap).length === 3) {
                adapter1.disconnect()
                if (!isDone) {
                    done()
                    isDone = true
                }
            }
        })

        adapter1.setDataChannelListeners((id) => {
                console.log('adapter data channel opened from: ' + id)
            }, (id) => {
                console.log('adapter data channel closed from: ' + id)
            }, (id, dataType, data) => {
                console.log('adapter data channel message from: ' + id + ' ' + dataType + ' ' +data)
            }
        )

    })
    */

})
