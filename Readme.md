# Networked A-Frame Mesh Adapter

This project aims to provide networked A-Frame peer to peer mesh adapter.

## Demo

Demo of the mesh networking setup with two server peers:

Rotating blue tetrahedrons are the server peer avatars.

Green tetrahedrons are player avatars.

https://naf-mesh-adapter-demo.glitch.me

<!-- Remix Button --><a href="https://glitch.com/edit/#!/remix/naf-mesh-adapter-demo">  <img src="https://cdn.glitch.com/2bdfb3f8-05ef-4035-a06e-2043962a3a13%2Fremix%402x.png?1513093958726" alt="remix button" aria-label="remix" height="33"></a>

# Testing

## Karma

---
    npm test
---

## NAF Adapter Test

Run NAF adapter-test in browser:

---
    npm run start:dev
---

Open browser at http://127.0.0.1:8081/adapter-test/

# Publish package

## First publish

---
    npm publish --access public
---

## Update

---
    npm version patch
    npm publish
---