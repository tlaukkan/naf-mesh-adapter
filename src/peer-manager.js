const PeerStatus = require('./mesh-adapter-model').PeerStatus;
const PeerData = require('./mesh-adapter-model').PeerData;

/**
 * Peer managed is used to manage peers and their connections.
 * @type {PeerManager}
 */
exports.PeerManager = class {

    /**
     * Default constructor setting up peer and peer connections maps.
     */
    constructor() {
        // Map of peer URL and peer Data
        this.peers = new Map();
        // Map of peer URL and map of the known peer URLs and Peer
        this.peerConnections = new Map();
    }

    /**
     * Apply changed peers and return all peers minus the peer identified the peer URL
     * @param peerUrl the peer URL
     * @param changedPeers the changed peers
     * @returns all currently known peers
     */
    peersChanged(peerUrl, changedPeers) {
        changedPeers.forEach(peer => {
            if (!peer.url || !peer.status || !peer.position) {
                throw new Error("Peer data object incomplete: " + JSON.stringify(peer));
            }
            if (this.peers.has(peer.url)) {
                if (peer.status === PeerStatus.UNAVAILABLE) {
                    this.peers.set(peer.url, peer);
                }
            } else {
                if (peer.status === PeerStatus.AVAILABLE) {
                    this.peers.set(peer.url, peer);
                }
            }
        });

        const peersWithUnavailablePeersIncluded = Array.from(this.peers.values()).filter(p => p.url !== peerUrl);

        this.peers.forEach(peer => {
            if (peer.status === PeerStatus.UNAVAILABLE) {
                this.peers.delete(peer.url);
            }
        });

        return peersWithUnavailablePeersIncluded;
    }

    /**
     * Find changed peers affecting peer identified by peer URL
     * @param peerUrl the peer URL
     * @param position the peer position
     * @param range the range
     * @param applyChanges if TRUE apply changed peers to the peer's map of connected peers
     * @returns {*}
     */
    findPeersChanged(peerUrl, position, range, applyChanges) {
        const peersInRange = this.findPeersInRange(position, range);

        if (!this.peerConnections.has(peerUrl)) {
            if (applyChanges) {
                this.peerConnections.set(peerUrl, peersInRange);
            }
            return Array.from(peersInRange.values()).filter(p => p.url !== peerUrl);
        }

        const currentPeers  = applyChanges ? this.peerConnections.get(peerUrl) : new Map(this.peerConnections.get(peerUrl));

        const peersAdded = [];
        const peersRemoved = [];

        peersInRange.forEach(peer => {
           if (!currentPeers.has(peer.url)) {
               peersAdded.push(peer);
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
                currentPeers.set(peer.url, peer);
            }
        });

        peersRemoved.forEach(peer => {
            if (peerUrl !== peer.url) {
                currentPeers.delete(peer.url);
            }
        });

        return peersAdded.concat(peersRemoved);
    }

    /**
     * Filter from the change list the actually changed peers affecting the peer identified by peer URL.
     * @param peerUrl the peer URL
     * @param position the position
     * @param range the range
     * @param changedPeers the changed peers
     * @returns changed peers that affect the peer identified by peer URL
     */
    peekChangedPeers(peerUrl, position, range, changedPeers) {
        const savedPeers = new Map(this.peers);
        this.peersChanged(peerUrl, changedPeers);
        const verifiedChangedPeers = this.findPeersChanged(peerUrl, position, range, false);
        this.peers = savedPeers;
        return verifiedChangedPeers;
    }

    /**
     * Find peers in given range.
     * @param position the position
     * @param range the range
     * @returns {Map<any, any>} peer URL, peer map
     */
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

};