import express from 'express';
import {ExpressMiddleWare} from "../lib/ExpressMiddleWare";
import {promises as fs} from 'fs';
import * as path from "path";

const app = express();
const emw = new ExpressMiddleWare((id) => {
    return "file:" + path.resolve(process.argv[2], id.substr(1));
});

app.listen(8888);
app.use("/video", emw.handle.bind(emw));
app.get("/", async (req, res, next) => {
    let filenames = await fs.readdir(process.argv[2]);

    res.send(`
<html>
    <head><title>Decoder Demo</title></head>
    <body><ul>
    ${filenames.map(filename => `
        <li><img src="/video/${filename}?action=image&time=10" width="150" />
        <video src="/video/${filename}?action=playlist"></video></li>
    `).join()}
</ul>
</body>`)
});
