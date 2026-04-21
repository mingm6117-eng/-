# Industry Brief Site

AI 行业信息看板。支持 OpenAI / DeepSeek / Anthropic。

## 一键打开

```bash
git clone https://github.com/mingm6117-eng/-.git
cd -
npm run openclaw
```

打开：

```text
http://127.0.0.1:5173/
```

## 配置 AI 生成

第一次运行会自动生成 `.env`。

打开 `.env`，填你的 key：

```bash
LLM_PROVIDER=deepseek
LLM_API_KEY=你的key
LLM_MODEL=deepseek-chat
```

也支持：

```bash
LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-mini
```

```bash
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514
```

## 更新新闻

```bash
npm run update
```

如果网站一直开着，会按 `.env` 里的时间每天自动刷新。

## 发布到阿里云

先把域名解析到你的 ECS 公网 IP。

然后运行：

```bash
ALIYUN_HOST=你的ECS公网IP DOMAIN=你的域名 npm run deploy:aliyun
```

更多说明看：

```text
docs/ALIYUN_DEPLOY.md
```

## 注意

不要把 `.env` 上传到 GitHub。
