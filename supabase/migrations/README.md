# Migration Kuralları

Bu klasör, Supabase SQL Editor'de yapılan HER şema değişikliğinin
(ALTER TABLE, ADD CONSTRAINT, CREATE TABLE, vb.) kalıcı kaydını tutar.

## Kural
Bundan sonra Supabase SQL Editor'de bir şema değişikliği (tablo/kolon/
constraint ekleme, silme, değiştirme) her yapıldığında, AYNI SQL bu
klasöre de bir dosya olarak eklenip commit edilecek.

## Dosya adlandırma
YYYYMMDD_kisa_aciklama.sql
Örnek: 20260904_fix_missing_foreign_keys.sql

## Neden
2026-09-04'te conversations/messages/deposit_applications tablolarında
foreign key'lerin sessizce eksik/kaybolmuş olduğu fark edildi. Migration
geçmişi tutulmadığı için ne zaman/nasıl kaybolduğu tespit edilemedi.
Bu klasör, böyle bir şeyin bir daha "iz bırakmadan" olmasını engellemek
için var — DB şeması artık kod gibi versiyonlanıyor.
