const sharp = require('sharp');
const fs = require('fs');
const GALLERY = ['img_1','img_3','img_6','img_12','img_14','img_15','img_22','img_23'];
(async () => {
  for (const name of GALLERY) {
    const p = `public/assets/raw/${name}.jpg`;
    const width = name === 'img_1' ? 1400 : 900;
    const buf = await sharp(p).resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 74, mozjpeg: true, progressive: true }).toBuffer();
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, p);
    console.log(name, (buf.length / 1024).toFixed(0) + 'KB');
  }
})();
