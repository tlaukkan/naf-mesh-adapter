/* global AFRAME, THREE */

if (typeof AFRAME === 'undefined') {
    throw new Error('AFRAME not available.');
}

if (typeof THREE === 'undefined') {
    throw new Error('THREE not available.');
}

AFRAME.registerComponent('terrain', {
    schema: {
        width: {type: 'number', default: 1},
        height: {type: 'number', default: 1},
        depth: {type: 'number', default: 1},
        opacity: {type: 'number', default: 1},
        color: {type: 'color', default: '#AAA'}
    },

    /**
     * Initial creation and setting of the mesh.
     */
    init: function () {
        let data = this.data;
        let el = this.el;

        // Create geometry.
        //this.geometry = new THREE.BoxBufferGeometry(data.width, data.height, data.depth);
        // Create material.
        //this.material = new THREE.MeshStandardMaterial({color: data.color});
        // Create mesh.
        //this.mesh = new THREE.Mesh(this.geometry, this.material);

        this.geometry = new THREE.Geometry();

        const dx = Math.cos(Math.PI / 3);
        const dy = Math.sin(Math.PI / 3);

        const radius = 20.0;
        const step = 1;

        const radiusSquared = radius * radius;

        let getHeight = (x, y) => {
            return 2 * Math.sin(Math.PI * (x*x + y*y) / radiusSquared);
        }

        let getVector3 = (i, j) => {
            return new THREE.Vector3(i + j * dx, j * dy, getHeight(i,j))
        };

        let addFace = (i, j, step, v, primary) => {
            if (primary) {
                this.geometry.vertices.push(
                    getVector3(i, j),
                    getVector3(i + step, j),
                    getVector3(i, j + step)
                );
            } else {
                this.geometry.vertices.push(
                    getVector3(i, j + step),
                    getVector3(i + step, j),
                    getVector3(i + step, j + step)
                );
            }

            let face = new THREE.Face3(v + 0, v + 1, v + 2);
            face.vertexColors[0] = new THREE.Color(0x00ff00);
            face.vertexColors[1] = new THREE.Color(0x00ff00);
            face.vertexColors[2] = new THREE.Color(0x00ff00);
            this.geometry.faces.push(face);
        };

        let v = 0;
        for (let i = -radius; i < radius; i+= step) {
            for (let j = -radius; j < radius; j+= step) {
                if (Math.abs(i + j) < radius) {
                    addFace(i, j, step, v, true);
                    v += 3;
                }
                if (Math.abs(i + j + step) < radius) {
                    addFace(i, j, step, v, false);
                    v += 3;
                }
            }
        }

        this.geometry.mergeVertices();
        this.geometry.computeFaceNormals();
        this.geometry.computeVertexNormals();

        //this.material = new THREE.MeshLambertMaterial({ color: 0x000000, shading: THREE.FlatShading, wireframe: true, transparent: true });
        this.material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: THREE.VertexColors });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        el.setObject3D('mesh', this.mesh);

        this.wireMaterial = new THREE.MeshLambertMaterial({ color: 0xdddddd, wireframe: true, vertexColors: THREE.VertexColors });
        this.wireMesh = new THREE.Mesh(this.geometry, this.wireMaterial);
        el.setObject3D('wire', this.wireMesh);

        /*
        var materials = [
            new THREE.MeshLambertMaterial({ color: 0xffffff, shading: THREE.FlatShading, vertexColors: THREE.VertexColors }),
            new THREE.MeshBasicMaterial({ color: 0x000000, shading: THREE.FlatShading, wireframe: true, transparent: true })
        ];
        var group1 = THREE.SceneUtils.createMultiMaterialObject(this.geometry, materials);
        group1.position.x = -400;
        group1.rotation.x = -1.87;*/

    }
});



AFRAME.registerPrimitive('a-terrain', {
    defaultComponents: {
        terrain: {},
        rotation: {x: -90, y: 0, z: 0}
    },
    mappings: {
        width: 'terrain.width',
        height: 'terrain.height',
        depth: 'terrain.depth',
        color: 'terrain.color',
        opacity: 'terrain.opacity'
    }
});