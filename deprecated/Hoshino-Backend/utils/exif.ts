import * as webpmux from 'node-webpmux'

export async function writeExif(
    media: Buffer | string,
    packname: string | null = 'hoshino :3',
    publisher: string | null = 'XNS-ivy'
): Promise<Buffer> {
    const stringJson = JSON.stringify({
        'sticker-pack-name': packname,
        'sticker-pack-publisher': publisher,
        'emojis': ['']
    })

    const exifAttr = Buffer.from('SUkqAAgAAAABAEFXBwAAAAAAFgAAAA==', 'base64')
    const jsonBuff = Buffer.from(stringJson, 'utf8')
    const exif     = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)

    const img = new webpmux.Image()
    await img.load(media)
    img.exif = exif
    return Buffer.from(await img.save(null))
}