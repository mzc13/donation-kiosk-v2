import express from 'express';
import fetch from 'node-fetch'

// const express = require('express')
// const fetch = require('node-fetch');

const app = express()
const port = 8080

app.get('/', (req, res) => {
    fetch('https://pokeapi.co/api/v2/pokemon/purugly')
        .then(r => r.json())
        .then(d => res.send(d));
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})