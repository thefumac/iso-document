import os
import sys
import json
import argparse
from datetime import datetime
from google.cloud import firestore as g_firestore
from firebase_config import FirebaseManager

# Windows 콘솔 한글 인코딩 처리
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 업로드 제외 파일 패턴
IGNORE_PREFIXES = ('~$', '.')

def determine_track_and_industry(standard: str, category: str, file_name: str):
    """규격명 및 파일 경로를 기반으로 트랙 및 업종 분류 매핑"""
    if standard == "IATF 16949":
        track = "IATF"
        industries = ["정밀가공/금속", "사출/플라스틱", "전자/전기 부품", "자동차/부품공통"]
    else:
        track = "ISO"
        if standard == "ISO 27001":
            industries = ["IT/소프트웨어/서비스", "전자/전기 부품", "제조/서비스 공통"]
        elif standard in ["ISO 14001", "ISO 45001"]:
            industries = ["정밀가공/금속", "사출/플라스틱", "건설/시공/엔지니어링", "화학/소재", "제조/시공 공통"]
        else:
            industries = ["정밀가공/금속", "사출/플라스틱", "전자/전기 부품", "건설/시공/엔지니어링", "IT/소프트웨어/서비스", "공통"]

    return track, industries

def find_documents(base_dir: str):
    """
    base_dir 내의 모든 문서 파일(.docx, .doc, .xlsx, .xls)을 탐색합니다.
    임시 파일 (~$로 시작) 및 숨김 파일은 제외합니다.
    """
    doc_files = []
    if not os.path.exists(base_dir):
        print(f"[오류] 지정된 디렉터리가 존재하지 않습니다: {base_dir}")
        return doc_files

    for root, _, files in os.walk(base_dir):
        for file in files:
            if file.startswith(IGNORE_PREFIXES):
                continue
            lower_file = file.lower()
            if not lower_file.endswith(('.docx', '.doc', '.xlsx', '.xls')):
                continue

            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, base_dir)
            storage_rel_path = rel_path.replace("\\", "/")
            
            path_parts = rel_path.split(os.sep)
            standard = path_parts[0] if len(path_parts) > 1 else "General"
            category = "/".join(path_parts[1:-1]) if len(path_parts) > 2 else ""

            file_type = "EXCEL" if lower_file.endswith(('.xlsx', '.xls')) else "WORD"
            track, industries = determine_track_and_industry(standard, category, file)

            doc_files.append({
                "local_path": full_path,
                "rel_path": storage_rel_path,
                "standard": standard,
                "track": track,
                "industries": industries,
                "category": category,
                "file_name": file,
                "file_type": file_type,
                "size_bytes": os.path.getsize(full_path)
            })

    return doc_files

def get_content_type(file_name: str) -> str:
    lower = file_name.lower()
    if lower.endswith('.docx'):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif lower.endswith('.xlsx'):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif lower.endswith('.doc'):
        return "application/msword"
    elif lower.endswith('.xls'):
        return "application/vnd.ms-excel"
    return "application/octet-stream"

def upload_templates(
    base_dir: str = "original_doc",
    storage_bucket: str = None,
    sync_firestore: bool = True,
    dry_run: bool = False
):
    print("=" * 60)
    print("      ISO/IATF 2단계 트랙·업종 통합 업로드 도구")
    print("=" * 60)
    
    # 1. 파일 목록 탐색
    print(f"[*] 문서 탐색 디렉터리: {os.path.abspath(base_dir)}")
    documents = find_documents(base_dir)
    total_count = len(documents)

    if total_count == 0:
        print("[!] 업로드할 대상 문서가 없습니다.")
        return

    print(f"[+] 총 {total_count}개의 유효한 템플릿 문서(Word + Excel)를 발견했습니다.")
    
    # 규격별 및 파일타입별 통계 집계
    standards_summary = {}
    word_count = 0
    excel_count = 0

    for doc in documents:
        std = doc["standard"]
        ftype = doc["file_type"]
        if ftype == "WORD":
            word_count += 1
        else:
            excel_count += 1

        if std not in standards_summary:
            standards_summary[std] = {"WORD": 0, "EXCEL": 0, "TOTAL": 0, "TRACK": doc["track"]}
        standards_summary[std][ftype] += 1
        standards_summary[std]["TOTAL"] += 1
    
    print("\n[트랙 및 규격별 문서 현황]")
    print(f" - 전체 자산: {total_count}개 (워드 DOCX: {word_count}개 / 엑셀 XLSX: {excel_count}개)")
    print("-" * 60)
    for std, counts in sorted(standards_summary.items()):
        print(f" - [{counts['TRACK']:<4}] {std:<15}: 총 {counts['TOTAL']:>3}개 (워드: {counts['WORD']:>2}개, 엑셀: {counts['EXCEL']:>2}개)")
    print("-" * 60)

    if dry_run:
        print("\n[알림] --dry-run 모드이므로 실제 업로드 및 DB 저장을 수행하지 않습니다.")
        return

    # 2. Firebase 초기화
    fb = FirebaseManager(storage_bucket=storage_bucket)
    bucket = fb.get_storage_bucket()
    db = fb.get_db() if sync_firestore else None

    if not bucket:
        print(f"[오류] Firebase Storage 버킷을 연결할 수 없습니다. (Bucket: {fb.storage_bucket})")
        return

    print(f"\n[*] 대상 Storage 버킷: {bucket.name}")
    print("[*] 업로드를 시작합니다...\n")

    success_count = 0
    fail_count = 0
    manifest_data = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_count": total_count,
        "word_count": word_count,
        "excel_count": excel_count,
        "tracks": {
            "IATF": ["IATF 16949"],
            "ISO": ["ISO 9001", "ISO 14001", "ISO 45001", "ISO 27001", "ISO 37001", "ISO 50001"]
        },
        "standards": {}
    }

    # 3. 파일 업로드 및 메타데이터 기록
    for i, doc in enumerate(documents, 1):
        storage_dest_path = f"templates/{doc['rel_path']}"
        print(f"[{i:03d}/{total_count:03d}] [{doc['file_type']}] 업로드 중: {doc['rel_path']} ... ", end="", flush=True)

        try:
            # 3-1. Firebase Storage 업로드
            blob = bucket.blob(storage_dest_path)
            content_type = get_content_type(doc["file_name"])
            blob.upload_from_filename(doc["local_path"], content_type=content_type)

            # 3-2. Firestore DB 저장 (옵션)
            if db:
                safe_doc_id = f"{doc['standard']}__{doc['file_name']}".replace("/", "_").replace(" ", "_")
                doc_ref = db.collection("templates").document(safe_doc_id)
                doc_ref.set({
                    "standard": doc["standard"],
                    "track": doc["track"],
                    "industries": doc["industries"],
                    "category": doc["category"],
                    "fileName": doc["file_name"],
                    "storagePath": storage_dest_path,
                    "fileSize": doc["size_bytes"],
                    "fileType": doc["file_type"],
                    "contentType": content_type,
                    "updatedAt": g_firestore.SERVER_TIMESTAMP
                }, merge=True)

            # 3-3. 매니페스트 구조화
            std = doc["standard"]
            if std not in manifest_data["standards"]:
                manifest_data["standards"][std] = []
            
            manifest_data["standards"][std].append({
                "fileName": doc["file_name"],
                "track": doc["track"],
                "industries": doc["industries"],
                "category": doc["category"],
                "storagePath": storage_dest_path,
                "fileSize": doc["size_bytes"],
                "fileType": doc["file_type"]
            })

            print("[성공]")
            success_count += 1

        except Exception as e:
            print(f"[실패] ({e})")
            fail_count += 1

    # 4. JSON 매니페스트 로컬 저장 및 Storage 업로드
    manifest_path = "template_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, ensure_ascii=False, indent=2)
    print(f"\n[+] 로컬 매니페스트 생성 완료: {manifest_path}")

    try:
        manifest_blob = bucket.blob("templates/manifest.json")
        manifest_blob.upload_from_filename(manifest_path, content_type="application/json")
        print("[+] Storage 매니페스트 업로드 완료: templates/manifest.json")
    except Exception as e:
        print(f"[경고] Storage 매니페스트 업로드 실패: {e}")

    # 5. 최종 결과 출력
    print("\n" + "=" * 60)
    print(f" 업로드 완료 요약: 총 {total_count}개 중 성공 {success_count}개 / 실패 {fail_count}개")
    print("=" * 60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ISO/IATF 문서 템플릿 Firebase Storage 및 Firestore 일괄 업로드")
    parser.add_argument("--dir", default="original_doc", help="업로드할 로컬 문서 디렉터리 (기본값: original_doc)")
    parser.add_argument("--bucket", default=None, help="Firebase Storage 버킷명")
    parser.add_argument("--no-firestore", action="store_true", help="Firestore 메타데이터 동기화 비활성화")
    parser.add_argument("--dry-run", action="store_true", help="실제 업로드 없이 탐색된 파일 목록만 출력")

    args = parser.parse_args()

    upload_templates(
        base_dir=args.dir,
        storage_bucket=args.bucket,
        sync_firestore=not args.no_firestore,
        dry_run=args.dry_run
    )
