import PizZip from 'pizzip';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ref, getBytes } from 'firebase/storage';
import { storage } from '../firebase';
import manifestData from '../../template_manifest.json';

/**
 * DOCX 내부 XML 텍스트 치환 함수 (서식 100% 보존)
 */
function replaceXmlText(xmlString, replacements) {
  let modifiedXml = xmlString;

  // 단락 <w:p> 단위로 run 분할 치환 처리
  modifiedXml = modifiedXml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (pBlock) => {
    const hasTarget = Object.keys(replacements).some(k => pBlock.includes(k));
    if (!hasTarget) return pBlock;

    let tValues = [];
    const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let match;
    while ((match = tRegex.exec(pBlock)) !== null) {
      tValues.push(match[1]);
    }

    let combinedText = tValues.join('');
    let changed = false;

    for (const [k, v] of Object.entries(replacements)) {
      if (k && v && combinedText.includes(k)) {
        combinedText = combinedText.replaceAll(k, v);
        changed = true;
      }
    }

    if (!changed) return pBlock;

    let first = true;
    return pBlock.replace(/<w:t((?:\s[^>]*)?)>([\s\S]*?)<\/w:t>/g, (fullMatch, attrs) => {
      if (first) {
        first = false;
        const safeAttrs = attrs.includes('xml:space') ? attrs : `${attrs} xml:space="preserve"`;
        return `<w:t${safeAttrs}>${escapeXml(combinedText)}</w:t>`;
      }
      return `<w:t${attrs}></w:t>`;
    });
  });

  return modifiedXml;
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Excel sharedStrings.xml 및 Sheet XML 텍스트 치환 함수 (서식 100% 보존)
 */
function replaceExcelXmlText(xmlString, replacements) {
  let modifiedXml = xmlString;

  // 1. <si> (shared string item) 요소 단위 치환
  modifiedXml = modifiedXml.replace(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g, (siBlock) => {
    const hasTarget = Object.keys(replacements).some(k => siBlock.includes(k));
    if (!hasTarget) return siBlock;

    let tValues = [];
    const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let match;
    while ((match = tRegex.exec(siBlock)) !== null) {
      tValues.push(match[1]);
    }

    let combinedText = tValues.join('');
    let changed = false;

    for (const [k, v] of Object.entries(replacements)) {
      if (k && v && combinedText.includes(k)) {
        combinedText = combinedText.replaceAll(k, v);
        changed = true;
      }
    }

    if (!changed) return siBlock;

    return `<si><t xml:space="preserve">${escapeXml(combinedText)}</t></si>`;
  });

  // 2. 단독 <t> 태그 fallback 치환
  for (const [k, v] of Object.entries(replacements)) {
    if (k && v && modifiedXml.includes(k)) {
      modifiedXml = modifiedXml.replaceAll(k, escapeXml(v));
    }
  }

  return modifiedXml;
}

/**
 * 선택된 규격의 문서들을 Firebase Storage에서 받아와 메모리에서 일괄 치환 후 단일 ZIP으로 다운로드
 */
export async function generateAndDownloadDocuments({
  selectedStandards,
  replacements,
  companyName = "기업",
  onProgress = () => {}
}) {
  const zip = new JSZip();

  // 1. 매니페스트에서 선택된 규격에 해당하는 파일 목록 필터링
  const targetFiles = [];
  for (const std of selectedStandards) {
    const files = manifestData.standards[std] || [];
    for (const f of files) {
      targetFiles.push({
        standard: std,
        ...f
      });
    }
  }

  const total = targetFiles.length;
  if (total === 0) {
    throw new Error("선택된 규격에 해당하는 템플릿 문서가 없습니다.");
  }

  // 2. 파일별 순차 다운로드 & 치환
  for (let i = 0; i < total; i++) {
    const item = targetFiles[i];
    const isExcel = item.fileName.toLowerCase().endsWith('.xlsx') || item.fileName.toLowerCase().endsWith('.xls') || item.fileType === 'EXCEL';
    const isWord = !isExcel;

    onProgress({
      current: i + 1,
      total,
      currentFile: item.fileName,
      standard: item.standard,
      fileType: isExcel ? 'EXCEL' : 'WORD',
      percent: Math.round(((i + 1) / total) * 90)
    });

    try {
      // Firebase Storage에서 원본 파일 다운로드 (ArrayBuffer)
      const storageFileRef = ref(storage, item.storagePath);
      const arrayBuffer = await getBytes(storageFileRef);

      let outputBuffer = arrayBuffer;

      // Word(.docx) 또는 Excel(.xlsx) OpenXML 치환 처리
      if (isWord || isExcel) {
        const pizZip = new PizZip(arrayBuffer);
        const fileNames = Object.keys(pizZip.files);

        for (const fname of fileNames) {
          if (isWord && fname.startsWith('word/') && (fname.endsWith('.xml') || fname.endsWith('.rels'))) {
            const content = pizZip.file(fname).asText();
            const replaced = replaceXmlText(content, replacements);
            pizZip.file(fname, replaced);
          } else if (isExcel && fname.startsWith('xl/') && (fname.endsWith('.xml') || fname.endsWith('.rels'))) {
            const content = pizZip.file(fname).asText();
            const replaced = replaceExcelXmlText(content, replacements);
            pizZip.file(fname, replaced);
          }
        }

        outputBuffer = pizZip.generate({
          type: 'uint8array',
          compression: 'DEFLATE'
        });
      }

      // 치환된 파일명 결정
      let outputFileName = item.fileName;
      for (const [k, v] of Object.entries(replacements)) {
        if (k && v) {
          outputFileName = outputFileName.replaceAll(k, v);
        }
      }
      if (replacements['{{DOC_PREFIX}}'] && outputFileName.includes('KW1')) {
        outputFileName = outputFileName.replaceAll('KW1', replacements['{{DOC_PREFIX}}']);
      }

      // JSZip에 규격별 디렉터리 경로로 추가
      const zipFolderPath = item.category ? `${item.standard}/${item.category}` : item.standard;
      zip.folder(zipFolderPath).file(outputFileName, outputBuffer);

    } catch (err) {
      console.error(`[오류] ${item.fileName} 처리 중 실패:`, err);
    }
  }

  onProgress({
    current: total,
    total,
    currentFile: "ZIP 압축 생성 중...",
    percent: 95
  });

  // 3. 최종 ZIP 생성 및 자동 다운로드
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const cleanCompanyName = companyName.replace(/[\/\\:*?"<>|]/g, '_').trim() || "회사";
  const zipFileName = `${cleanCompanyName}_ISO표준문서_일괄발급_${new Date().toISOString().slice(0, 10)}.zip`;

  saveAs(zipBlob, zipFileName);

  onProgress({
    current: total,
    total,
    currentFile: "완료",
    percent: 100
  });

  return { total, zipFileName };
}
