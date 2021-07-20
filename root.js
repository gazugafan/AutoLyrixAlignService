const express = require('express');
const path = require('path');

function index(req, res)
{
	return res.sendFile(path.join(__dirname, '/index.html'));
}

module.exports.index = index;
