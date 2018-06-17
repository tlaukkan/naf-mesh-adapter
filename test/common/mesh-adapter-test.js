// eslint-disable-next-line no-unused-vars
const assert = require('assert');
const uuidv4 = require('uuid/v4');

const WebSocketImplementation = (typeof (WebSocket) !== 'undefined') ? WebSocket : require('websocket').w3cwebsocket
const RTCPeerConnectionImplementation = (typeof (RTCPeerConnection) !== 'undefined') ? RTCPeerConnection : require('wrtc').RTCPeerConnection

const MeshAdapter = require('../../src/mesh-adapter').MeshAdapter;

describe('mesh-adapter', function() {
    it('should connect and transmit message', function(done) {
        this.timeout(5000);
        const adapter1 = new MeshAdapter(RTCPeerConnectionImplementation, WebSocketImplementation);
        adapter1.email = 'adapter1'
        adapter1.secret = uuidv4()

        adapter1.setServerConnectListeners((id) => {
            console.log('adapter 1 connected to server and got id: ' + id)
        }, () => {
            console.log('adapter 1 server connect failed')
        })

        adapter1.setRoomOccupantListener((occupantMap) => {
            console.log('adapter 1 occupant change')
        })

        adapter1.setDataChannelListeners((id) => {
                console.log('adapter 1 data channel opened from: ' + id)
            }, (id) => {
                console.log('adapter 1 data channel closed from: ' + id)
            }, (id, dataType, data) => {
                console.log('adapter 1 data channel message from: ' + id + ' ' + dataType + ' ' +data)
                adapter1.closeStreamConnection(id)
            }
        )

        const adapter2 = new MeshAdapter(RTCPeerConnectionImplementation, WebSocketImplementation);
        adapter2.email = 'adapter2'
        adapter2.secret = uuidv4()

        adapter2.connect()

        adapter2.setServerConnectListeners((id) => {
            console.log('adapter 2 connected to server and got id: ' + id)

            adapter1.setServerPeerUrls(id)
            adapter1.connect()

        }, () => {
            console.log('adapter 2 server connect failed')
        })

        adapter2.setRoomOccupantListener((occupantMap) => {
            console.log('adapter 2 occupant change')
        })

        adapter2.setDataChannelListeners((id) => {
                console.log('adapter 2 data channel opened from: ' + id)
                console.log('adapter 2 data channel sending test hello')
                adapter2.sendData(id, 'test', 'hello')
            }, (id) => {
                console.log('adapter 2 data channel closed from: ' + id)
                adapter1.disconnect()
                adapter2.disconnect()
                done()
            }, (id, dataType, data) => {
                console.log('adapter 2 data channel message from: ' + id + ' ' + dataType + ' ' +data)
            }
        )
    })

    it('should connect broadcast', function(done) {
        this.timeout(10000);
        const adapter1 = new MeshAdapter(RTCPeerConnectionImplementation, WebSocketImplementation);
        adapter1.email = 'adapter1'
        adapter1.secret = uuidv4()
        adapter1.setRoomOccupantListener((occupantMap) => {
            console.log('adapter 1 occupant change: ' + Object.keys(occupantMap).length)
        })
        adapter1.setServerConnectListeners((id) => {
            console.log('adapter 1 connected to server and got id: ' + id)
        })

        const adapter2 = new MeshAdapter(RTCPeerConnectionImplementation, WebSocketImplementation);
        adapter2.email = 'adapter2'
        adapter2.secret = uuidv4()

        adapter2.setServerConnectListeners((id) => {
            console.log('adapter 2 connected to server and got id: ' + id)

            adapter1.setServerUrl(id)
            adapter1.connect()

        }, () => {
            console.log('adapter 2 server connect failed')
        })

        adapter2.setRoomOccupantListener((occupantMap) => {
            console.log('adapter 2 occupant change: ' + Object.keys(occupantMap).length)
        })

        const adapter3 = new MeshAdapter(RTCPeerConnectionImplementation, WebSocketImplementation);
        adapter3.email = 'adapter3'
        adapter3.secret = uuidv4()

        adapter3.connect()

        adapter3.setServerConnectListeners((id) => {
            console.log('adapter 3 connected to server and got id: ' + id)

            adapter2.setServerUrl(id)
            adapter2.connect()

        }, () => {
            console.log('adapter 3 server connect failed')
        })

        adapter3.setRoomOccupantListener((occupantMap) => {
            console.log('adapter 3 occupant change: ' + Object.keys(occupantMap).length)
            if (Object.keys(occupantMap).length === 2) {
                adapter1.disconnect()
                adapter2.disconnect()
                adapter3.disconnect()
                done()
            }
        })

        adapter3.setDataChannelListeners((id) => {
                console.log('adapter 3 data channel opened from: ' + id)
            }, (id) => {
                console.log('adapter 3 data channel closed from: ' + id)
            }, (id, dataType, data) => {
                console.log('adapter 3 data channel message from: ' + id + ' ' + dataType + ' ' +data)
                adapter1.closeStreamConnection(id)
            }
        )
    })

})
