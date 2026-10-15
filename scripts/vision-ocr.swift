import AppKit
import Foundation
import PDFKit
import Vision

let path = CommandLine.arguments.dropFirst().first ?? ""
if path.isEmpty {
  fputs("usage: vision-ocr <file>\n", stderr)
  exit(2)
}

func fitted(_ image: CGImage) -> CGImage {
  let maxSide: CGFloat = 1600
  let width = CGFloat(image.width)
  let height = CGFloat(image.height)
  let scale = min(1, maxSide / max(width, height, 1))
  if scale > 0.98 { return image }
  let pixelWidth = Int(width * scale)
  let pixelHeight = Int(height * scale)
  guard let context = CGContext(
    data: nil,
    width: pixelWidth,
    height: pixelHeight,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else { return image }
  context.interpolationQuality = .high
  context.draw(image, in: CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
  return context.makeImage() ?? image
}

func recognize(_ image: CGImage) -> String {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["zh-Hant", "zh-Hans", "en-US"]
  request.usesLanguageCorrection = false
  let handler = VNImageRequestHandler(cgImage: fitted(image), options: [:])
  do {
    try handler.perform([request])
  } catch {
    return ""
  }
  return (request.results ?? [])
    .compactMap { $0.topCandidates(1).first?.string }
    .joined(separator: "\n")
}

func cgImage(from image: NSImage) -> CGImage? {
  var rect = NSRect(origin: .zero, size: image.size)
  return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

let url = URL(fileURLWithPath: path)
let ext = url.pathExtension.lowercased()
var pages: [String] = []

if ext == "pdf" {
  guard let document = PDFDocument(url: url) else { exit(1) }
  let count = min(document.pageCount, 6)
  for index in 0..<count {
    guard let page = document.page(at: index) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let longest = max(bounds.width, bounds.height, 1)
    let scale = min(2, 1600 / longest)
    let image = page.thumbnail(of: NSSize(width: bounds.width * scale, height: bounds.height * scale), for: .mediaBox)
    if let cg = cgImage(from: image) {
      let text = recognize(cg)
      if !text.isEmpty { pages.append(text) }
    }
  }
} else if let image = NSImage(contentsOf: url), let cg = cgImage(from: image) {
  let text = recognize(cg)
  if !text.isEmpty { pages.append(text) }
}

print(pages.joined(separator: "\n"))
