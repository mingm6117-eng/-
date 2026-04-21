# 阿里云公网部署

目标：把网站跑在阿里云 ECS 上，并用你的域名访问。

## 1. 准备

你需要：

- 一台阿里云 ECS
- ECS 安装了 Node.js 20+
- ECS 安装了 Nginx
- 域名 A 记录已经指向 ECS 公网 IP
- 阿里云安全组放行 `80` 和 `443`

## 2. 一键部署

在本机运行：

```bash
ALIYUN_HOST=你的ECS公网IP DOMAIN=你的域名 npm run deploy:aliyun
```

如果不是 `root` 用户：

```bash
ALIYUN_HOST=你的ECS公网IP SSH_USER=你的用户名 DOMAIN=你的域名 npm run deploy:aliyun
```

## 3. 配置 AI Key

第一次部署后，登录服务器：

```bash
ssh root@你的ECS公网IP
cd /var/www/industry-brief-site
nano .env
```

填入：

```bash
LLM_PROVIDER=deepseek
LLM_API_KEY=你的key
LLM_MODEL=deepseek-chat
```

保存后重启：

```bash
pm2 restart industry-brief-site
```

如果没有 PM2：

```bash
pkill -f "node server.js" || true
nohup env PORT=5500 node server.js > app.log 2>&1 &
```

## 4. 更新新闻

在服务器上运行：

```bash
cd /var/www/industry-brief-site
npm run update
```

服务一直运行时，也会按 `.env` 里的时间每天自动刷新。

## 5. 常见问题

- 访问不了：检查阿里云安全组是否放行 `80`。
- 域名打不开：检查域名 A 记录是否指向 ECS 公网 IP。
- AI 不更新：检查服务器 `.env` 里的 `LLM_API_KEY`。
- HTTPS：先确认 HTTP 可访问，再用宝塔/阿里云证书/Nginx 证书工具配置 HTTPS。
