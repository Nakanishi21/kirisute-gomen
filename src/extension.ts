import * as vscode from 'vscode';

// ========================================
// ドキュメントの内容をキャッシュするMap
// 削除された文字を特定するために、変更前の内容を保持する
// ========================================
const documentCache = new Map<string, string>();

// ========================================
// 拡張機能が起動したときに呼ばれる関数
// VS Codeが起動すると自動的にこの関数が実行される
// ========================================
export function activate(context: vscode.ExtensionContext) {
    console.log('Kirisute Gomen is now active!');

    // 現在開いているドキュメントをキャッシュ
    vscode.workspace.textDocuments.forEach((doc) => {
        documentCache.set(doc.uri.toString(), doc.getText());
    });

    // ドキュメントが開かれたときにキャッシュ
    const onOpen = vscode.workspace.onDidOpenTextDocument((doc) => {
        documentCache.set(doc.uri.toString(), doc.getText());
    });

    // ドキュメントが閉じられたときにキャッシュを削除
    const onClose = vscode.workspace.onDidCloseTextDocument((doc) => {
        documentCache.delete(doc.uri.toString());
    });

    // テキストが変更されたときのイベントを監視する
    const onChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        const docUri = event.document.uri.toString();
        const previousText = documentCache.get(docUri) || '';

        // 現在アクティブなエディタを取得
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) {
            // キャッシュを更新して終了
            documentCache.set(docUri, event.document.getText());
            return;
        }

        // 各変更をチェック
        for (const change of event.contentChanges) {
            // 削除かどうかを判定
            const isDelete = change.rangeLength > 0 && change.text === '';

            // 改行削除かどうかを判定
            const isNewlineDelete = change.range.start.line !== change.range.end.line;

            if (isDelete && !isNewlineDelete) {
                // 削除された文字を取得（キャッシュから）
                const startOffset = event.document.offsetAt(change.range.start);
                const deletedChar = previousText.substring(startOffset, startOffset + change.rangeLength);

                // 削除された位置を取得
                const position = change.range.start;

                // 落下アニメーションを表示！
                showFallingAnimation(editor, position, deletedChar);
            }
        }

        // キャッシュを更新
        documentCache.set(docUri, event.document.getText());
    });

    // 拡張機能が無効になったときにイベント監視を解除するために登録
    context.subscriptions.push(onOpen, onClose, onChangeDisposable);
}

// ========================================
// 斬り方の種類
// ========================================
type CutDirection = 'horizontal' | 'vertical';

// ========================================
// 落下アニメーションを表示する関数
// 文字を真っ二つに斬って、片方が落ちる演出
// ========================================
function showFallingAnimation(editor: vscode.TextEditor, position: vscode.Position, deletedChar: string) {
    // アニメーション設定
    const totalFrames = 10;
    const frameDuration = 50;
    const fallDistance = 50;

    // ランダムで斬り方を決定
    const cutDirection: CutDirection = Math.random() > 0.5 ? 'horizontal' : 'vertical';

    let currentFrame = 0;
    let prevFirstPart: vscode.TextEditorDecorationType | null = null;
    let prevSecondPart: vscode.TextEditorDecorationType | null = null;

    const animationInterval = setInterval(() => {
        // 前のフレームのDecorationを削除
        if (prevFirstPart) {
            prevFirstPart.dispose();
        }
        if (prevSecondPart) {
            prevSecondPart.dispose();
        }

        currentFrame++;
        const progress = currentFrame / totalFrames;

        // 透明度（徐々にフェードアウト）
        const opacity = 1 - progress;

        // 落下位置（イージング: 加速しながら落ちる）
        const fallY = fallDistance * progress * progress;

        // clip-pathで半分だけ表示
        const leftClipPath = 'inset(0 50% 0 0)';   // 左半分
        const rightClipPath = 'inset(0 0 0 50%)';  // 右半分
        const topClipPath = 'inset(0 0 50% 0)';    // 上半分
        const bottomClipPath = 'inset(50% 0 0 0)'; // 下半分

        let firstPart: vscode.TextEditorDecorationType;
        let secondPart: vscode.TextEditorDecorationType;

        // margin-right: -1emで文字の幅を打ち消してレイアウトに影響を与えない
        // 2つ目は1つ目の直後に来るが、1つ目の幅が0なので同じ位置になる

        if (cutDirection === 'horizontal') {
            // 横斬り（上下に分断）: 上が残る、下が落ちる
            firstPart = vscode.window.createTextEditorDecorationType({
                after: {
                    contentText: deletedChar,
                    color: `rgba(255, 107, 107, ${opacity})`,
                    fontWeight: 'bold',
                    textDecoration: `none; position: relative; margin-right: -1em; clip-path: ${topClipPath};`
                }
            });
            secondPart = vscode.window.createTextEditorDecorationType({
                after: {
                    contentText: deletedChar,
                    color: `rgba(255, 107, 107, ${opacity})`,
                    fontWeight: 'bold',
                    textDecoration: `none; position: relative; top: ${fallY}px; margin-right: -1em; clip-path: ${bottomClipPath};`
                }
            });
        } else {
            // 縦斬り（左右に分断）: 両方が左右に分かれながら落ちる
            const splitX = fallDistance * progress * 0.3;  // 左右に広がる距離
            firstPart = vscode.window.createTextEditorDecorationType({
                after: {
                    contentText: deletedChar,
                    color: `rgba(255, 107, 107, ${opacity})`,
                    fontWeight: 'bold',
                    textDecoration: `none; position: relative; top: ${fallY}px; left: ${-splitX}px; margin-right: -1em; clip-path: ${leftClipPath};`
                }
            });
            secondPart = vscode.window.createTextEditorDecorationType({
                after: {
                    contentText: deletedChar,
                    color: `rgba(255, 107, 107, ${opacity})`,
                    fontWeight: 'bold',
                    textDecoration: `none; position: relative; top: ${fallY}px; left: ${splitX}px; margin-right: -1em; clip-path: ${rightClipPath};`
                }
            });
        }

        // 装飾を適用
        const range = new vscode.Range(position, position);
        editor.setDecorations(firstPart, [range]);
        editor.setDecorations(secondPart, [range]);

        // 次のフレームで削除するために保持
        prevFirstPart = firstPart;
        prevSecondPart = secondPart;

        // アニメーション終了
        if (currentFrame >= totalFrames) {
            clearInterval(animationInterval);
            firstPart.dispose();
            secondPart.dispose();
        }
    }, frameDuration);
}

// ========================================
// 拡張機能が無効になったときに呼ばれる関数
// ========================================
export function deactivate() {
    console.log('Kirisute Gomen is now deactivated!');
}
