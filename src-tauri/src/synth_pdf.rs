use std::io::Cursor;
use std::path::{Path, PathBuf};
use image::codecs::jpeg::JpegEncoder;
use image::GenericImageView;
use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, Stream};

#[derive(Debug, Clone, Copy)]
pub enum ImageQuality {
    High,
    Balanced,
    Lite,
}

impl ImageQuality {
    pub fn jpeg_quality(self) -> u8 {
        match self {
            ImageQuality::High => 94,
            ImageQuality::Balanced => 86,
            ImageQuality::Lite => 72,
        }
    }
}

/// 纯 Rust 免 Office 本地合成章节 PDF：
/// 1) 将每张学习通图文幻灯片编码为 JPEG XObject，按原始宽高比写入独立页面
/// 2) 如章节内还勾选了原生 PDF 讲义，自动追加合并为单一章节复习 PDF
pub fn synthesize_chapter_pdf(
    slide_images: &[PathBuf],
    existing_pdfs: &[PathBuf],
    output_path: &Path,
    quality: ImageQuality,
) -> Result<(), String> {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let mut page_ids: Vec<Object> = Vec::new();

    for img_path in slide_images {
        let img = image::open(img_path)
            .map_err(|e| format!("读取幻灯片图片失败 ({:?}): {}", img_path, e))?;
        let (w_px, h_px) = img.dimensions();
        let rgb = img.to_rgb8();

        let mut jpeg_buf = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_buf, quality.jpeg_quality());
        encoder
            .encode(&rgb, w_px, h_px, image::ExtendedColorType::Rgb8)
            .map_err(|e| format!("JPEG 编码失败: {}", e))?;

        // 将图片映射为宽屏演示 PDF 点尺寸（以 960pt 宽为基准等比缩放）
        let page_w = 960.0_f32;
        let page_h = page_w * (h_px as f32 / w_px.max(1) as f32);

        let img_stream = Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => w_px as i64,
                "Height" => h_px as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8,
                "Filter" => "DCTDecode",
            },
            jpeg_buf,
        );
        let img_id = doc.add_object(img_stream);

        let content = Content {
            operations: vec![
                Operation::new("q", vec![]),
                Operation::new(
                    "cm",
                    vec![
                        page_w.into(),
                        0.into(),
                        0.into(),
                        page_h.into(),
                        0.into(),
                        0.into(),
                    ],
                ),
                Operation::new("Do", vec![Object::Name(b"Im0".to_vec())]),
                Operation::new("Q", vec![]),
            ],
        };
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));

        let resources_id = doc.add_object(dictionary! {
            "XObject" => dictionary! {
                "Im0" => img_id,
            },
        });

        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), page_w.into(), page_h.into()],
            "Resources" => resources_id,
            "Contents" => content_id,
        });
        page_ids.push(page_id.into());
    }

    // 追加已有 PDF 页面（保留原始矢量文字）
    for pdf_path in existing_pdfs {
        if let Ok(mut src_doc) = Document::load(pdf_path) {
            let max_id = doc.max_id + 1;
            src_doc.renumber_objects_with(max_id);
            let src_pages = src_doc.get_pages();
            for (obj_id, obj) in src_doc.objects.clone() {
                doc.objects.insert(obj_id, obj);
            }
            doc.max_id = doc.objects.keys().map(|(id, _)| *id).max().unwrap_or(doc.max_id);
            for (_, src_page_id) in src_pages {
                if let Ok(page_dict) = doc.get_dictionary_mut(src_page_id) {
                    page_dict.set("Parent", pages_id);
                    page_ids.push(src_page_id.into());
                }
            }
        }
    }

    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Kids" => page_ids.clone(),
        "Count" => page_ids.len() as i64,
    };
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    doc.compress();

    let mut out_bytes = Cursor::new(Vec::new());
    doc.save_to(&mut out_bytes)
        .map_err(|e| format!("保存 PDF 失败: {}", e))?;
    std::fs::write(output_path, out_bytes.into_inner())
        .map_err(|e| format!("写入 PDF 文件失败: {}", e))?;

    Ok(())
}


#[cfg(test)]
mod synth_tests {
    use super::*;
    use crate::synth_pptx::synthesize_chapter_pptx;

    fn make_jpeg(path: &Path, color: [u8; 3]) {
        let img = image::RgbImage::from_fn(320, 240, |_x, _y| image::Rgb(color));
        img.save(path).expect("写测试图片失败");
    }

    #[test]
    fn synth_pdf_and_pptx_binary() {
        let dir = std::env::temp_dir().join("cx_synth_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let mut pages = Vec::new();
        for (i, c) in [[220u8, 40, 40], [40, 160, 80], [40, 80, 220]].iter().enumerate() {
            let p = dir.join(format!("{}.jpg", i + 1));
            make_jpeg(&p, *c);
            pages.push(p);
        }

        let pdf = dir.join("out.pdf");
        synthesize_chapter_pdf(&pages, &[], &pdf, ImageQuality::High).expect("合成 PDF 失败");
        let bytes = std::fs::read(&pdf).unwrap();
        assert!(bytes.starts_with(b"%PDF-"), "PDF 文件头不对");
        assert!(bytes.len() > 1000, "PDF 过小");
        println!("PDF: {} bytes", bytes.len());

        let pptx = dir.join("out.pptx");
        synthesize_chapter_pptx(&pages, &pptx, ImageQuality::High).expect("合成 PPTX 失败");
        let zbytes = std::fs::read(&pptx).unwrap();
        assert!(zbytes.starts_with(b"PK"), "PPTX 不是 zip 容器");
        let f = std::fs::File::open(&pptx).unwrap();
        let mut zip = zip::ZipArchive::new(f).unwrap();
        let names: Vec<String> = (0..zip.len()).map(|i| zip.by_index(i).unwrap().name().to_string()).collect();
        assert!(names.iter().any(|n| n == "ppt/presentation.xml"), "缺 presentation.xml");
        assert!(names.iter().any(|n| n == "ppt/slides/slide1.xml"), "缺 slide1.xml");
        assert!(names.iter().any(|n| n.starts_with("ppt/media/")), "缺媒体文件");
        println!("PPTX: {} bytes, {} 个部件", zbytes.len(), names.len());
        println!("样例部件: {:?}", &names.iter().take(6).collect::<Vec<_>>());
    }
}
