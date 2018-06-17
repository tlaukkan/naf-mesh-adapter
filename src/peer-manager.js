const PeerStatus = require('./mesh-adapter-model').PeerStatus
const PeerData = require('./mesh-adapter-model').PeerData

exports.PeerManager = class {

    constructor() {

        // Map of peer URL and peer Data
        this.peers = new Map()

        // Map of peer URL and map of the known peer URLs and Peer
        this.peerConnections = new Map()
    }

    peersChanged(peerUrl, changedPeers) {
        changedPeers.forEach(peer => {
            if (this.peers.has(peer.url)) {
                if (peer.status === PeerStatus.UNAVAILABLE) {
                    this.peers.set(peer.url, peer)
                }
            } else {
                if (peer.status === PeerStatus.AVAILABLE) {
                    this.peers.set(peer.url, peer)
                }
            }
        });

        const peersWithUnavailablePeersIncluded = Array.from(this.peers.values()).filter(p => p.url !== peerUrl);

        this.peers.forEach(peer => {
            if (peer.status === PeerStatus.UNAVAILABLE) {
                this.peers.delete(peer.url);
            }
        });

        return peersWithUnavailablePeersIncluded
    }

    findPeersChanged(peerUrl, position, range) {
        const peersInRange = this.findPeersInRange(position, range)

        if (!this.peerConnections.has(peerUrl)) {
            this.peerConnections.set(peerUrl, peersInRange);
            return Array.from(peersInRange.values()).filter(p => p.url !== peerUrl);
        }

        const currentPeers  = this.peerConnections.get(peerUrl)

        const peersAdded = [];
        const peersRemoved = [];

        peersInRange.forEach(peer => {
           if (!currentPeers.has(peer.url)) {
               peersAdded.push(peer)
           }
        });

        currentPeers.forEach(peer => {
           if (!peersInRange.has(peer.url)) {
               peersRemoved.push(
                   new PeerData(
                       peer.url,
                       PeerStatus.UNAVAILABLE,
                       peer.position
                   )
               );
           }
        });

        peersAdded.forEach(peer => {
            if (peerUrl !== peer.url) {
                currentPeers.set(peer.url, peer)
            }
        });

        peersRemoved.forEach(peer => {
            if (peerUrl !== peer.url) {
                currentPeers.delete(peer.url)
            }
        });

        return peersAdded.concat(peersRemoved)
    }

    findPeersInRange(position, range) {
        const peersInRange = new Map();
        const rangeSquared = range * range;

        this.peers.forEach(peer => {
            const distanceSquared =   (position.x - peer.position.x) * (position.x - peer.position.x) +
                                    (position.y - peer.position.y) * (position.y - peer.position.y) +
                                    (position.z - peer.position.z) * (position.z - peer.position.z);
            if (distanceSquared <= rangeSquared) {
                peersInRange.set(peer.url, peer)
            }
        });

        return peersInRange
    }

}