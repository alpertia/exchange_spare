# SpareShare Email Fixes — 17 Mart 2026

## Sorunlar ve Çözümler

### 1. Yanlış FROM Adresi
**Sorun:** `const FROM = 'SpareShare <noreply@ant-soft.uk>'`
Root domain kullanılıyordu, Resend'de verify edilmiş domain değil.

**Çözüm:** `src/app/api/email/route.ts`
```
const FROM = process.env.EMAIL_FROM ?? 'SpareShare <noreply@mail.ant-soft.uk>'
```

### 2. RESEND_API_KEY Prefix Eksikti
**Sorun:** Vercel'de key `XEa116V4_...` olarak kaydedilmişti, `re_` prefix'i düşmüştü.
Resend geçersiz key'i sessizce reddediyordu — `{"ok":true}` dönüyordu ama email gitmiyordu.

**Çözüm:** Key silindi, `re_XEa116V4_...` olarak yeniden eklendi.

### 3. Vercel'de Eksik Env Variables
**Sorun:** `EMAIL_FROM` ve `NEXT_PUBLIC_APP_URL` Vercel'de yoktu.

**Çözüm:** İkisi de eklendi, scope: Production + Preview + Development.

| Variable | Value |
|----------|-------|
| EMAIL_FROM | SpareShare <noreply@mail.ant-soft.uk> |
| NEXT_PUBLIC_APP_URL | https://spareshare.ant-soft.uk |
| RESEND_API_KEY | re_XEa116V4_... |

### 4. Welcome Email Yoktu
**Sorun:** `register/route.ts` kullanıcı oluşturuyordu ama email göndermiyordu.

**Çözüm:** `register/route.ts`'e welcome email trigger eklendi.
`email/route.ts`'e `welcome` template eklendi.

### 5. Duplicate Welcome Template
**Sorun:** `sed` komutu welcome template'i 3 kez ekledi.

**Çözüm:** `sed -i '' '233,256d'` ile duplicate'ler temizlendi.

---

## Mevcut Email Template Listesi

| Template | Tetikleyen Aksiyon | Alıcı |
|----------|-------------------|-------|
| welcome | Register | Yeni kullanıcı |
| deposit_request | Deposit başvurusu | Admin |
| deposit_approved | Admin onayı | Şirket |
| tx_confirmed | Teklif kabul | Şirket |
| tx_payment_held | Ödeme Trade Assurance'a alındı | Şirket |
| tx_shipped | Kargo gönderildi | Şirket |
| tx_delivered | Teslimat onaylandı | Şirket |
| tx_disputed | Dispute açıldı | Admin |
| consultant_inquiry | Consultant formu | Admin |
| new_message | Yeni mesaj | Şirket |
| ai_credit_purchased | AI kredi satın alma | Şirket |

---

## Notlar
- Forgot password emaili Supabase tarafından gönderiliyor (Resend SMTP üzerinden)
- Supabase SMTP henüz test edilmedi
- İlk emailler Gmail'de junk'a düşebilir — alıcı "Not spam" işaretlemeli
- Domain reputation zamanla düzelir

## Sonuç
Email sistemi production'da çalışıyor.
Test: curl ile welcome email gönderildi, Resend dashboard'da Delivered görüldü.
