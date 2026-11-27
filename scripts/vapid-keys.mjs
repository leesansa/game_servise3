// Web Push 용 VAPID 키 한 쌍을 만들어 .dev.vars 형식으로 출력한다. 실행: node scripts/vapid-keys.mjs
// 공개키 = P-256 공개키 원본(65바이트) base64url, 개인키 = JWK 의 d (32바이트) base64url — web-push 패키지와 같은 형식
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey)
console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
