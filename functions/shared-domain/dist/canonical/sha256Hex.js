"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256Hex = sha256Hex;
const sha2_js_1 = require("@noble/hashes/sha2.js");
const utils_js_1 = require("@noble/hashes/utils.js");
function sha256Hex(message) {
    return (0, utils_js_1.bytesToHex)((0, sha2_js_1.sha256)((0, utils_js_1.utf8ToBytes)(message)));
}
