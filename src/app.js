const webrtc = require('wrtc');
const SignalingServer = require('@tlaukkan/webrtc-signaling').SignalingServer;
const MeshAdapter = require('./mesh-adapter').MeshAdapter;

const port = process.env.PORT || 8080;

const serverPeerUrls = process.env.SERVER_PEER_URLS || '';
const email = process.env.EMAIL || 'default-email';
const secret = process.env.SECRET || 'default-secret';
const serverPeerUrlArray = serverPeerUrls.split(',')

if (serverPeerUrls.length > 3) {
    console.log('Server peer URLs are:')
    serverPeerUrlArray.forEach(serverPeerUrl => {
        if (serverPeerUrl.length > 3) {
            console.log(' * ' + serverPeerUrl)
        }
    })
} else {
    console.warn('SERVER_PEER_URLS environment variable not set.')
}

if (email == 'default-email') {
    console.warn('EMAIL environment variable not set.')
}
if (secret == 'default-secret') {
    console.warn('SECRET environment variable not set.')
}

console.log('server peer starting...')

const signalingServer = new SignalingServer('0.0.0.0', port)

const adapter = new MeshAdapter(webrtc.RTCPeerConnection);
adapter.setServerPeerUrls(serverPeerUrls)
//adapter.debugLogPrefix = 'DEBUG '

adapter.email = email
adapter.secret = secret;

adapter.setServerConnectListeners((id) => {
    console.log('connected to signaling server and was assigned client ID: ' + id)
    setTimeout(() => {
        repeatedReconnect()
    }, 15000)
}, () => {
    console.log('signaling server connect failed')
})

adapter.setRoomOccupantListener((occupantMap) => {
    console.log('occupant change: ' + JSON.stringify(occupantMap))
})

adapter.setDataChannelListeners((id) => {
        console.log('peer data channel opened from: ' + id)
    }, (id) => {
        console.log('peer data channel closed from: ' + id)
    }, (id, dataType, data) => {
        console.log('peer data channel message from: ' + id + ' ' + dataType + ' ' +data)
    }
)

adapter.connect()

process.on('exit', function() {
    signalingServer.close()
    adapter.close()
});

function repeatedReconnect() {

    adapter.peers.forEach((connected, peerUrl) => {
        if (!connected) {
            console.log('cleaning up disconnected peer: ' + peerUrl)
            adapter.peers.delete(peerUrl)
        }
    })

    serverPeerUrlArray.forEach(serverPeerUrl => {
        if (serverPeerUrl.length > 3) {
            if (!adapter.peers.has(serverPeerUrl) || !adapter.peers.get(serverPeerUrl)) {
                console.log('disconnected server peer, attempting to reconnect: ' + serverPeerUrl)
                adapter.startStreamConnection(serverPeerUrl)
            } else {
                console.log('connected server peer: ' + serverPeerUrl)
            }
        }
    })

    setTimeout(() => {
        repeatedReconnect()
    }, 15000)
}

console.log('server peer started.')