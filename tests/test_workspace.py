import unittest

from fastapi import HTTPException

from app.workspace import (
    MAX_UPLOAD_BYTES,
    UPLOAD_CHUNK_BYTES,
    expected_chunk_bytes,
    validate_upload,
)


class UploadValidationTests(unittest.TestCase):
    def test_accepts_csv_and_zip_and_strips_path_components(self):
        self.assertEqual(
            validate_upload(r"C:\client\orders.csv", 10),
            ("orders.csv", "text/csv"),
        )
        self.assertEqual(
            validate_upload("../exports/data.ZIP", 10),
            ("data.ZIP", "application/zip"),
        )

    def test_rejects_non_csv_and_zip_files(self):
        with self.assertRaises(HTTPException) as raised:
            validate_upload("report.xlsx", 10)
        self.assertEqual(raised.exception.status_code, 415)

    def test_rejects_empty_or_oversized_files(self):
        for size in (0, MAX_UPLOAD_BYTES + 1):
            with self.subTest(size=size):
                with self.assertRaises(HTTPException) as raised:
                    validate_upload("data.csv", size)
                self.assertEqual(raised.exception.status_code, 413)

    def test_computes_final_chunk_size_and_rejects_out_of_range_chunks(self):
        size = UPLOAD_CHUNK_BYTES + 17
        self.assertEqual(expected_chunk_bytes(size, 0), UPLOAD_CHUNK_BYTES)
        self.assertEqual(expected_chunk_bytes(size, 1), 17)
        with self.assertRaises(HTTPException) as raised:
            expected_chunk_bytes(size, 2)
        self.assertEqual(raised.exception.status_code, 416)


if __name__ == "__main__":
    unittest.main()
