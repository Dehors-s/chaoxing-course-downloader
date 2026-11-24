use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use image::codecs::jpeg::JpegEncoder;
use image::GenericImageView;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::synth_pdf::ImageQuality;

// 16:9 宽屏 PPTX 标准画布尺寸（EMU 单位：13.333in x 7.5in）
const SLIDE_W_EMU: u64 = 12_192_000;
const SLIDE_H_EMU: u64 = 6_858_000;

/// 纯 Rust 免 Office 本地合成标准 OpenXML (.pptx)：
/// 直接输出 PowerPoint / WPS / Keynote 原生可打开的 16:9 高清演示文稿
pub fn synthesize_chapter_pptx(
    slide_images: &[PathBuf],
    output_path: &Path,
    quality: ImageQuality,
) -> Result<(), String> {
    let file = File::create(output_path).map_err(|e| format!("创建 PPTX 失败: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let xml_opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let media_opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    let slide_count = slide_images.len();

    // 1. [Content_Types].xml
    let mut slide_overrides = String::new();
    for idx in 1..=slide_count {
        slide_overrides.push_str(&format!(
            r#"<Override PartName="/ppt/slides/slide{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>"#
        ));
    }
    let content_types = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  {slide_overrides}
</Types>"#
    );
    write_entry(&mut zip, "[Content_Types].xml", content_types.as_bytes(), xml_opts)?;

    // 2. _rels/.rels
    let root_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#;
    write_entry(&mut zip, "_rels/.rels", root_rels.as_bytes(), xml_opts)?;

    // 3. ppt/presentation.xml & ppt/_rels/presentation.xml.rels
    let mut sld_id_lst = String::new();
    let mut pres_rels = String::from(
        r#"<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>"#,
    );
    for idx in 1..=slide_count {
        let rid = idx + 1;
        let sid = 255 + idx;
        sld_id_lst.push_str(&format!(r#"<p:sldId id="{sid}" r:id="rId{rid}"/>"#));
        pres_rels.push_str(&format!(
            r#"<Relationship Id="rId{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{idx}.xml"/>"#
        ));
    }

    let presentation_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>{sld_id_lst}</p:sldIdLst>
  <p:sldSz cx="{SLIDE_W_EMU}" cy="{SLIDE_H_EMU}"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>"#
    );
    write_entry(&mut zip, "ppt/presentation.xml", presentation_xml.as_bytes(), xml_opts)?;

    let pres_rels_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{pres_rels}</Relationships>"#
    );
    write_entry(&mut zip, "ppt/_rels/presentation.xml.rels", pres_rels_xml.as_bytes(), xml_opts)?;

    // 4. 最小化合规 Master / Layout / Theme
    write_master_and_layout(&mut zip, xml_opts)?;

    // 5. 逐页写入高清图片与等比居中居中排版 XML
    for (i, img_path) in slide_images.iter().enumerate() {
        let idx = i + 1;
        let img = image::open(img_path)
            .map_err(|e| format!("读取图片失败 ({:?}): {}", img_path, e))?;
        let (w_px, h_px) = img.dimensions();
        let rgb = img.to_rgb8();

        let mut jpeg_buf = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_buf, quality.jpeg_quality());
        encoder
            .encode(&rgb, w_px, h_px, image::ExtendedColorType::Rgb8)
            .map_err(|e| format!("JPEG 编码失败: {}", e))?;

        write_entry(
            &mut zip,
            &format!("ppt/media/image{idx}.jpg"),
            &jpeg_buf,
            media_opts,
        )?;

        // 计算等比自适应居中坐标（防止 4:3 旧课件被拉扁）
        let img_ratio = w_px as f64 / h_px.max(1) as f64;
        let slide_ratio = SLIDE_W_EMU as f64 / SLIDE_H_EMU as f64;
        let (cx, cy) = if img_ratio > slide_ratio {
            let cx = SLIDE_W_EMU;
            let cy = (SLIDE_W_EMU as f64 / img_ratio).round() as u64;
            (cx, cy)
        } else {
            let cy = SLIDE_H_EMU;
            let cx = (SLIDE_H_EMU as f64 * img_ratio).round() as u64;
            (cx, cy)
        };
        let off_x = (SLIDE_W_EMU.saturating_sub(cx)) / 2;
        let off_y = (SLIDE_H_EMU.saturating_sub(cy)) / 2;

        let slide_xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="SlideImage{idx}"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId2"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm><a:off x="{off_x}" y="{off_y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>"#
        );
        write_entry(
            &mut zip,
            &format!("ppt/slides/slide{idx}.xml"),
            slide_xml.as_bytes(),
            xml_opts,
        )?;

        let slide_rels = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image{idx}.jpg"/>
</Relationships>"#
        );
        write_entry(
            &mut zip,
            &format!("ppt/slides/_rels/slide{idx}.xml.rels"),
            slide_rels.as_bytes(),
            xml_opts,
        )?;
    }

    zip.finish().map_err(|e| format!("封装 PPTX 失败: {}", e))?;
    Ok(())
}

fn write_entry(
    zip: &mut ZipWriter<File>,
    name: &str,
    data: &[u8],
    opts: SimpleFileOptions,
) -> Result<(), String> {
    zip.start_file(name, opts).map_err(|e| e.to_string())?;
    zip.write_all(data).map_err(|e| e.to_string())
}

fn write_master_and_layout(
    zip: &mut ZipWriter<File>,
    opts: SimpleFileOptions,
) -> Result<(), String> {
    let master = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>"#;
    let master_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>"#;
    let layout = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>"#;
    let layout_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>"#;
    let theme = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CleanAcademic">
  <a:themeElements>
    <a:clrScheme name="Academic">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="0F172A"/></a:dk2>
      <a:lt2><a:srgbClr val="F3F5F8"/></a:lt2>
      <a:accent1><a:srgbClr val="2563EB"/></a:accent1>
      <a:accent2><a:srgbClr val="0D9488"/></a:accent2>
      <a:accent3><a:srgbClr val="4F46E5"/></a:accent3>
      <a:accent4><a:srgbClr val="D97706"/></a:accent4>
      <a:accent5><a:srgbClr val="16A34A"/></a:accent5>
      <a:accent6><a:srgbClr val="DC2626"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="1D4ED8"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="AcademicFont"><a:majorFont><a:latin typeface="Microsoft YaHei UI"/></a:majorFont><a:minorFont><a:latin typeface="Microsoft YaHei UI"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Basic"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>"#;

    write_entry(zip, "ppt/slideMasters/slideMaster1.xml", master.as_bytes(), opts)?;
    write_entry(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels", master_rels.as_bytes(), opts)?;
    write_entry(zip, "ppt/slideLayouts/slideLayout1.xml", layout.as_bytes(), opts)?;
    write_entry(zip, "ppt/slideLayouts/_rels/slideLayout1.xml.rels", layout_rels.as_bytes(), opts)?;
    write_entry(zip, "ppt/theme/theme1.xml", theme.as_bytes(), opts)?;
    Ok(())
}
