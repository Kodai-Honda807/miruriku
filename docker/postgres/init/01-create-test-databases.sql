-- 初回起動時のみ実行されます。単体（DB 統合）テストと E2E 用のデータベースを分けます。
CREATE DATABASE miruriku_test OWNER miruriku;
CREATE DATABASE miruriku_e2e OWNER miruriku;
