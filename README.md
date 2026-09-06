# このへんにいるよ

買い物中に別行動になった家族・友人と、だいたいの位置を「レーダー」でざっくり共有するアプリ。
正確な地図やナビではなく、方角と距離だけを見せる。詳しい設計思想は `design-spec.md` を参照。

技術構成: Vite + TypeScript（フレームワークなし） + Supabase（DB・リアルタイム購読）。

---

## 1. 必要なもの

- Node.js（18以上）
- Supabaseの無料アカウント（ https://supabase.com ）

## 2. セットアップ

### 2-1. 依存関係のインストール

```
npm install
```

### 2-2. Supabaseプロジェクトを作る

1. https://supabase.com でプロジェクトを新規作成
2. 左メニューの **SQL Editor** を開き、このリポジトリの `supabase/schema.sql` の中身を全部貼り付けて実行
   （`groups` テーブルと `members` テーブル、リアルタイム購読の設定が一括で作られる）
3. **Project Settings → API** を開き、以下2つをコピーしておく
   - `Project URL`
   - `anon public` キー

### 2-3. 環境変数を設定

`.env.example` をコピーして `.env` を作り、2-2でコピーした値を入れる。

```
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxxxxx
```

`.env` はGitにコミットしない（`.gitignore`済み）。

### 2-4. 起動

```
npm run dev
```

表示されたURL（`http://localhost:5173` など）をブラウザで開く。

**注意**: 位置情報の許可ダイアログはHTTPSでないと基本的に出ない。`localhost` は例外的に許可されるブラウザが多いのでローカル開発では動くはずだが、スマホ実機で試す場合は同じネットワーク上でも `http://` のIPアドレスだと出ないことがある（後述のVercelデプロイ後に試すのが確実）。

## 3. 本番デプロイ（Vercel想定）

1. このリポジトリをVercelに接続
2. Vercel側の環境変数に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定
3. デプロイ（Build Command: `npm run build` / Output: `dist`。Viteプロジェクトなので自動検出されるはず）

Vercelは自動でHTTPSになるので、スマホでの位置情報許可もそのまま機能する。

## 4. 実装の中身（迷ったときに見る場所）

| ファイル | 役割 |
|---|---|
| `src/main.ts` | 画面遷移・位置情報の取得と送信・Supabase購読・レーダー描画。ロジックの本体 |
| `src/lib/geo.ts` | 距離(Haversine)・方角(bearing)の計算 |
| `src/lib/colors.ts` | 参加順に応じたメンバーカラーの割り当て（6色パレット、6人目以降はループ） |
| `src/lib/format.ts` | 距離・経過時間の表示フォーマット、グループコード生成 |
| `src/lib/supabase.ts` | Supabaseクライアントの初期化 |
| `src/style.css` | デザイントークン（色・フォント・角丸など）を含む全スタイル |
| `supabase/schema.sql` | DBスキーマとRLSポリシー |

## 5. 割り切っていること（正直に書いておく）

- **認証なし。** グループコードを知っていれば誰でも読み書きできる。これは仕様書の前提どおり（「コードを知っている人には位置が見える」ことを隠さず伝える設計）。信頼できる相手とだけコードを共有する前提のアプリ。
- **グループの自動解散は未実装。** Supabase上に古いグループ・メンバーの行が残り続ける。運用するなら定期削除のジョブを別途足す必要がある（仕様書 7章にも「今後の検討事項」として明記されている）。
- **リアルタイム購読＋5秒ごとのポーリングの二重構成。** Supabase Realtimeが主だが、購読が途切れた場合の保険としてポーリングも回している。
- 位置情報の送信間隔は8秒。バッテリー・通信量を考慮した仕様書の指示どおり。

## 6. 今後やるとしたら

仕様書7章と同じ：招待方法（QRコードなど）、グループの自動解散、プライバシー同意文言の整備、オフライン時の挙動。
