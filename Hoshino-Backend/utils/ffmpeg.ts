import os from 'os'
import path from 'path'
import fs from 'fs'

export async function gifBufferToMp4(gifBuffer: Buffer): Promise<Buffer> {
    const tmpGif = path.join(os.tmpdir(), `hoshino-gif-${Date.now()}.gif`)
    const tmpMp4 = path.join(os.tmpdir(), `hoshino-mp4-${Date.now()}.mp4`)

    await Bun.write(tmpGif, gifBuffer)

    const proc = Bun.spawn({
        cmd: [
            'ffmpeg',
            '-i', tmpGif,
            '-movflags', 'faststart',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-y', tmpMp4
        ],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const exitCode = await proc.exited
    fs.unlinkSync(tmpGif)
    if (exitCode !== 0) {
        fs.existsSync(tmpMp4) && fs.unlinkSync(tmpMp4)
        const err = await new Response(proc.stderr).text()
        throw new Error(`ffmpeg failed: ${err}`)
    }

    const mp4 = Buffer.from(await Bun.file(tmpMp4).arrayBuffer())
    fs.unlinkSync(tmpMp4)
    return mp4
}