import os
import json
import firebase_admin
from firebase_admin import credentials, firestore, storage, auth

# 기본 서비스 계정 키 파일 경로 (프로젝트 루트의 serviceAccountKey.json)
DEFAULT_CRED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "serviceAccountKey.json")

class FirebaseManager:
    """
    Firebase Admin SDK 연동 및 관리를 위한 클래스
    """
    _instance = None
    _initialized = False

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(FirebaseManager, cls).__new__(cls)
        return cls._instance

    def __init__(self, cred_path: str = DEFAULT_CRED_PATH, storage_bucket: str = None):
        if not self._initialized:
            self.cred_path = cred_path
            
            # project_id 읽기
            self.project_id = None
            if os.path.exists(self.cred_path):
                try:
                    with open(self.cred_path, 'r', encoding='utf-8') as f:
                        key_data = json.load(f)
                        self.project_id = key_data.get('project_id')
                except Exception:
                    pass

            # storage_bucket 미지정 시 기본값 자동 설정 (우선순위: 인자 > 환경변수 > <project_id>.firebasestorage.app)
            if storage_bucket:
                self.storage_bucket = storage_bucket
            elif os.environ.get('FIREBASE_STORAGE_BUCKET'):
                self.storage_bucket = os.environ.get('FIREBASE_STORAGE_BUCKET')
            elif self.project_id:
                self.storage_bucket = f"{self.project_id}.firebasestorage.app"
            else:
                self.storage_bucket = None

            self.app = None
            self.db = None
            self.bucket = None
            self._init_firebase()
            FirebaseManager._initialized = True

    def _init_firebase(self):
        try:
            if not firebase_admin._apps:
                if not os.path.exists(self.cred_path):
                    print(f"[경고] Firebase 인증 키 파일이 존재하지 않습니다: {self.cred_path}")
                    print("Firebase Console에서 다운로드한 'serviceAccountKey.json' 파일을 해당 경로에 배치해 주세요.")
                    return

                cred = credentials.Certificate(self.cred_path)
                options = {}
                if self.storage_bucket:
                    options['storageBucket'] = self.storage_bucket

                self.app = firebase_admin.initialize_app(cred, options)
                print(f"[성공] Firebase Admin SDK가 성공적으로 초기화되었습니다. (Project: {self.project_id}, Bucket: {self.storage_bucket})")

            # Firestore 및 Storage 클라이언트 초기화
            self.db = firestore.client()
            if self.storage_bucket:
                self.bucket = storage.bucket()

        except Exception as e:
            print(f"[오류] Firebase 초기화 중 오류 발생: {e}")

    def get_db(self):
        """Firestore DB 클라이언트 반환"""
        if not self.db and firebase_admin._apps:
            self.db = firestore.client()
        return self.db

    def get_storage_bucket(self):
        """Cloud Storage Bucket 반환"""
        if not self.bucket and firebase_admin._apps:
            self.bucket = storage.bucket()
        return self.bucket

# 싱글톤 인스턴스 편의 함수
def get_firebase():
    return FirebaseManager()
