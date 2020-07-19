import beamcoder from "beamcoder";

(async function() {
    let demuxer = await beamcoder.demuxer('file:/home/christoph/remux.mp4');
    console.log(JSON.stringify(demuxer));
})()
