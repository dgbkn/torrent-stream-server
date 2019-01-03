"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const torrent_stream_1 = __importDefault(require("torrent-stream"));
const range_parser_1 = __importDefault(require("range-parser"));
const pump_1 = __importDefault(require("pump"));
const port = 3000;
function createApp() {
    const app = express_1.default();
    app.use(express_1.default.json());
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });
    return app;
}
class TorrentsStore {
    constructor() {
        this.torrents = {};
    }
    async addAndGet(link) {
        return new Promise((resolve) => {
            console.log(link);
            const torrent = torrent_stream_1.default(link);
            if (torrent.infoHash in this.torrents) {
                console.log(`Torrent already exists - ${link}`);
                resolve(this.torrents[torrent.infoHash]);
            }
            else {
                console.log(`Adding new torrent - ${link}`);
                this.torrents[torrent.infoHash] = torrent;
                torrent.on('ready', () => {
                    resolve(torrent);
                });
            }
        });
    }
    getAll() {
        return Object.values(this.torrents);
    }
}
function setup() {
    const app = createApp();
    const store = new TorrentsStore();
    app.get('/status', (req, res) => res.send('ok'));
    app.get('/torrents', (req, res) => res.send(store.getAll().map(torrent => ({
        infoHash: torrent.infoHash,
        files: torrent.files.map(file => ({
            name: file.name,
            path: file.path,
            length: file.length
        }))
    }))));
    app.get('/stream', async (req, res) => {
        const link = req.query.torrent;
        if (!link) {
            return res.send(400);
        }
        const headersRange = req.headers.range instanceof Array ? req.headers.range[0] : req.headers.range;
        let torrent;
        try {
            torrent = await store.addAndGet(link);
        }
        catch (error) {
            return res.status(400).send(String(error));
        }
        const file = torrent.files.find(f => f.name === req.query.file) || torrent.files[0];
        if (!file) {
            return res.send(400);
        }
        const parsedRange = headersRange ? range_parser_1.default(file.length, headersRange) : undefined;
        const range = parsedRange instanceof Array ? parsedRange[0] : undefined;
        res.setHeader('Accept-Ranges', 'bytes');
        res.type(file.name);
        req.connection.setTimeout(3600000);
        if (!range) {
            res.setHeader('Content-Length', file.length);
            if (req.method === 'HEAD') {
                return res.end();
            }
            return pump_1.default(file.createReadStream(), res);
        }
        res.statusCode = 206;
        res.setHeader('Content-Length', range.end - range.start + 1);
        res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + file.length);
        if (req.method === 'HEAD') {
            return res.end();
        }
        pump_1.default(file.createReadStream(range), res);
    });
    app.listen(port, () => console.log(`Listening on port ${port}!`));
}
exports.setup = setup;