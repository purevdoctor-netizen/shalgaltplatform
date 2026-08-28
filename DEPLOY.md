# Суулгах гарын авлага — сургуулийн дотоод сүлжээнд 24/7

Энэ баримт нь платформыг **нэг сургуулийн дотоод сүлжээнд (LAN)** тасралтгүй ажиллуулах
алхмуудыг тайлбарлана. 300–1000 сурагчийн хэмжээнд тохирсон.

> Интернэтээр нийтэд гаргах бол [§9 Интернэтэд гаргах](#9-интернэтэд-гаргах) хэсгийг үзнэ үү.

---

## Агуулга

1. [Юу хэрэгтэй вэ](#1-юу-хэрэгтэй-вэ)
2. [Тогтмол IP тохируулах ⚠](#2-тогтмол-ip-тохируулах-)
3. [Нэг командаар суулгах](#3-нэг-командаар-суулгах)
4. [Юу болсныг шалгах](#4-юу-болсныг-шалгах)
5. [Хэрэглэгчдэд түгээх](#5-хэрэглэгчдэд-түгээх)
6. [HTTPS ба камерын хязгаарлалт](#6-https-ба-камерын-хязгаарлалт)
7. [Өгөгдлийн сан: SQLite эсвэл PostgreSQL](#7-өгөгдлийн-сан-sqlite-эсвэл-postgresql)
8. [Нөөцлөлт ба арчилгаа](#8-нөөцлөлт-ба-арчилгаа)
9. [Интернэтэд гаргах](#9-интернэтэд-гаргах)
10. [Асуудал шийдэх](#10-асуудал-шийдэх)

---

## 1. Юу хэрэгтэй вэ

### Сервер компьютер

|        | Хамгийн бага                     | Зөвлөх      |
| ------ | -------------------------------- | ----------- |
| CPU    | 2 цөм                            | 4 цөм       |
| RAM    | 4 GB                             | 8 GB        |
| Диск   | 20 GB сул                        | 50 GB (SSD) |
| Систем | Windows 10/11 эсвэл Server 2019+ | ижил        |
| Сүлжээ | **Утсан (Ethernet)** холболт     | ижил        |

**Чухал шаардлага:**

- Компьютер **24 цаг асаалттай** байна — унтах/hibernate горимыг унтраана.
- Сургуулийн Wi-Fi/LAN сүлжээнд байнга холбогдсон байна.
- **UPS (тасалдалгүй тэжээл)** хэрэглэхийг зөвлөнө — цахилгаан тасрахад өгөгдөл гэмтэхээс сэргийлнэ.

### Унтах горимыг унтраах

Админ эрхтэй PowerShell дээр:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 15
powercfg /hibernate off
```

### Програм хангамж

- **Node.js 20 LTS** — https://nodejs.org (`node --version` шалгана)
- pnpm — суулгах скрипт өөрөө суулгана
- Docker **ХЭРЭГГҮЙ** (LAN горимд шаардлагагүй)

---

## 2. Тогтмол IP тохируулах ⚠

Энэ бол **хамгийн чухал алхам**. QR код дотор серверийн IP хаяг шингэдэг тул
IP өөрчлөгдвөл **хэвлэсэн бүх QR ажиллахаа болино**.

### Хувилбар А — Router дээр DHCP reservation (зөвлөх)

1. Серверийн MAC хаягийг олно:
   ```powershell
   Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name, MacAddress
   ```
2. Router-ийн тохиргоо (ихэвчлэн `192.168.1.1`) → **DHCP Reservation** / **Static Lease**
3. Тухайн MAC-д тогтмол IP ононо, ж: `192.168.1.50`

### Хувилбар Б — Windows дээр статик IP

```powershell
# Одоогийн тохиргоог харах
Get-NetIPConfiguration

# Жишээ: 192.168.1.50 болгох (өөрийн сүлжээнд тохируулна)
New-NetIPAddress -InterfaceAlias 'Ethernet' -IPAddress 192.168.1.50 `
    -PrefixLength 24 -DefaultGateway 192.168.1.1
Set-DnsClientServerAddress -InterfaceAlias 'Ethernet' -ServerAddresses 192.168.1.1, 8.8.8.8
```

> ⚠ Статик IP нь router-ийн DHCP мужаас **гадуур** байх ёстой, эс бөгөөс хаяг мөргөлдөнө.
> Ихэвчлэн DHCP нь `.100`–`.200` мужийг эзэлдэг тул `.50` аюулгүй.

### Санахад хялбар нэр (сонголтоор)

`192.168.1.50:8080` гэдэг сурагчдад төвөгтэй. Хоёр аргаар сайжруулна:

1. **80 порт ашиглах** → `http://192.168.1.50` (порт бичихгүй)
2. **Router-ийн DNS-д нэр нэмэх** → `http://shalgalt.local`
   (олон router дээр "Local DNS" / "Host names" гэсэн хэсэгт байдаг)

---

## 3. Нэг командаар суулгах

**Админ эрхээр PowerShell нээнэ** (Start → PowerShell → баруун товч → _Run as administrator_):

```powershell
cd C:\Users\purev.b\burtgel-web\shalgalt-platform

# Имэйлгүйгээр (тайланг гараар татна)
.\scripts\setup-server.ps1 -Port 8080 -SetPrivateNetwork `
    -AdminUsername admin -AdminName "Сургуулийн админ"

```

Имэйлийг дараа нь тусад нь тохируулна ([§5.1](#51-имэйл-тохируулах)):

```powershell
.\scripts\setup-email.ps1
```

> **`ExecutionPolicy` алдаа гарвал:**
>
> ```powershell
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> ```

### Скрипт юу хийдэг вэ

| Алхам | Тайлбар                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| 1     | LAN IP-г автоматаар илрүүлж баталгаажуулна                                                                         |
| 2     | `.env`-ыг production утгаар бичнэ (хуучныг нөөцөлнө)                                                               |
| 3     | Хамаарал суулгаж, өгөгдлийн сангийн migration ажиллуулна                                                           |
| 4     | Вэб апп-ыг **тухайн LAN хаягаар** build хийнэ (QR код зөв заана)                                                   |
| 5     | **Админ данс** үүсгэж түр нууц үгийг нэг удаа хэвлэнэ                                                              |
| 6     | Windows Firewall-д дүрэм нэмнэ (зөвхөн Private + Domain профайл)                                                   |
| 7     | NSSM-ээр **Windows Service** болгож бүртгэнэ — компьютер асахад автоматаар эхэлнэ, унтарвал 5 сек дараа дахин асна |
| 8     | Ажиллаж байгааг шалгана                                                                                            |

> ⚠ Скрипт ажиллаж дуусахад **админы түр нууц үг** дэлгэц дээр гарна.
> Дахин харах боломжгүй тул тэр дор нь хуулж аваарай.

### Гол онцлог: нэг процесс

LAN горимд API болон вэб апп **ижил порт дээр, нэг Node процессоор** ажиллана
(`SERVE_WEB_DIR=apps/web/dist`). Тиймээс:

- nginx, Docker, WSL2 **шаардлагагүй**
- CORS асуудал үүсэхгүй (ижил origin)
- Арчлах зүйл ганцхан — нэг үйлчилгээ

---

## 4. Юу болсныг шалгах

```powershell
# Үйлчилгээний төлөв
Get-Service ShalgaltPlatform

# Лог (шууд урсгалаар)
Get-Content logs\service.log -Tail 50 -Wait

# Эрүүл мэнд
Invoke-RestMethod http://localhost:8080/api/health
```

Өөр компьютер/утаснаас браузераар нээнэ:

```
http://192.168.1.50:8080
```

### Удирдах командууд

```powershell
Restart-Service ShalgaltPlatform     # дахин асаах (.env зассаны дараа)
Stop-Service ShalgaltPlatform        # зогсоох
Start-Service ShalgaltPlatform       # асаах
```

---

## 5. Хэрэглэгчдэд түгээх

### Эрхийн загвар

| Хэн               | Данс               | Юу хийж чадах                                                       |
| ----------------- | ------------------ | ------------------------------------------------------------------- |
| **Админ** (1 хүн) | Суулгах үед үүснэ  | Багш нарын данс нээх/хаах, нууц үг сэргээх, **бүх** шалгалтыг харах |
| **Багш**          | Админ нээж өгнө    | Зөвхөн **өөрийн** шалгалт үүсгэх, удирдах, тайлан авах              |
| **Сурагч**        | ❌ Данс шаардахгүй | QR уншиж шалгалт өгөх                                               |

### Админ — багшийн данс нээх

1. `http://192.168.1.50:8080/login` → админаар нэвтэрнэ.
2. Баруун дээд булангийн цэс → **Хэрэглэгчийн удирдлага** (эсвэл `/admin/users`).
3. **«Шинэ данс нээх»** → нэвтрэх нэр, овог нэр, имэйл бөглөнө.
4. Систем **түр нууц үгийг нэг удаа** харуулна:

   ```
   Нэвтрэх нэр : bagsh.ganbat
   Түр нууц үг : peki-bo-4739
   ```

   ⚠ Энэ нууц үгийг **дахин харах боломжгүй**. Хуулж аваад багшид дамжуулна уу.
   Мартвал ижил хуудсаас **«Нууц үг сэргээх»** дарна.

5. Багш эхний нэвтрэлтэд **өөрийн нууц үгээ заавал солино** (систем албадана).

### Багш нар

1. `http://192.168.1.50:8080/login` → админаас авсан нэр/нууц үгээр нэвтэрнэ.
2. Эхний удаад нууц үгээ солино.
3. **«Шинэ шалгалт үүсгэх»** → шалгалт нь тухайн багшид харьяалагдана.
4. Нүүр хуудсанд **зөвхөн өөрийн** шалгалтууд харагдана.

> **Хуваалцах линк:** шалгалт бүр `?t=<токен>` линктэй хэвээр. Хамтран ажиллах багшид
> дамжуулбал тэр хүн нэвтрэхгүйгээр тухайн шалгалтыг удирдаж чадна.
> Хаах бол `.env`-д `DISABLE_SHARE_TOKEN=true` тавина.

### Дансны арчилгаа

| Нөхцөл                 | Хийх зүйл                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Багш нууц үгээ мартсан | `/admin/users` → **Нууц үг сэргээх**                                                |
| Багш ажлаас гарсан     | **Идэвхгүй болгох** (шалгалт, тайлан хадгалагдана)                                  |
| Буруу үүсгэсэн данс    | **Устгах** (зөвхөн шалгалтгүй бол)                                                  |
| Админы нууц үг мартсан | Сервер дээр: `pnpm --filter @shalgalt/api admin:create -- --username admin --reset` |

> Системд **дор хаяж нэг идэвхтэй админ** заавал үлдэнэ — сүүлийн админыг
> идэвхгүй болгох/устгах боломжгүй.

### Сурагчид

Сурагчид **юу ч суулгах шаардлагагүй** — зүгээр л:

1. Сургуулийн Wi-Fi-д холбогдоно.
2. Утасныхаа **үндсэн камерын аппаар** QR кодыг уншина → линк нээгдэнэ.
3. Овог, нэр, анги оруулаад шалгалт өгнө.

### Практик зөвлөмж

| Юу                            | Яаж                                                                         |
| ----------------------------- | --------------------------------------------------------------------------- |
| QR кодыг проектороор харуулах | Багшийн QR дэлгэц → **Бүтэн дэлгэц** товч                                   |
| QR кодыг хэвлэх               | QR дэлгэц → **Хэвлэх** (A4-д тохирсон)                                      |
| Ангийн ханан дээр наах        | Нэг удаа хэвлэж наана — `online`/`lan` горимд QR **хэзээ ч өөрчлөгддөггүй** |
| Хаягийг самбарт бичих         | `192.168.1.50:8080` (эсвэл 80 порт дээр `192.168.1.50`)                     |

> **Чухал:** `online`/`lan` горимд горим солиход (ӨМНӨХ → ДАРААХ) **QR өөрчлөгдөхгүй**.
> Нэг удаа хэвлэсэн QR-ыг хичээлийн жилийн турш ашиглана.

### Сурагчид интернэт хэрэггүй

Сурагч зөвхөн **сургуулийн Wi-Fi** дотор байхад хангалттай — гаднах интернэт шаардахгүй.
Сервер өөрөө бүх зүйлийг өгнө.

---

## 5.1 Имэйл тохируулах

Тайланг багшийн имэйл рүү илгээхийн тулд SMTP тохируулна. **Тохируулаагүй бол**
багш тайлангаа «Word (.docx) татах» товчоор гараар татна — систем ажиллах боловч
имэйл явахгүй.

### Хамгийн хялбар: скриптээр

```powershell
cd C:\Users\purev.b\burtgel-web\shalgalt-platform
.\scripts\setup-email.ps1
```

Скрипт нь имэйл хаяг, нууц үгийг **далдалж** асууж, `.env`-ыг шинэчилж,
холболтыг шалгана. Нууц үг дэлгэц дээр харагдахгүй.

Шууд туршилтын захиатай:

```powershell
.\scripts\setup-email.ps1 -Email bagsh@gmail.com -FromName "12-р сургууль" -TestTo purevdoctor@gmail.com
```

### Gmail — App Password заавал хэрэгтэй

> ⚠ **Энгийн Gmail нууц үг АЖИЛЛАХГҮЙ.** Google 2022 оноос хойш гуравдагч
> програмд энгийн нууц үгээр нэвтрэхийг хаасан.

1. https://myaccount.google.com/security
2. **2-Step Verification**-ыг АСААНА (энэгүйгээр App password үүсэхгүй)
3. https://myaccount.google.com/apppasswords
4. Апп нэр бичээд үүсгэнэ → **16 тэмдэгт** код гарна (ж: `abcd efgh ijkl mnop`)
5. Тэр кодыг скриптэд оруулна (зайг нь автоматаар авна)

### Гараар тохируулах

`.env` файлд:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=bagsh@gmail.com
SMTP_PASS="abcdefghijklmnop"
SMTP_FROM="12-р сургууль <bagsh@gmail.com>"
```

> **Порт ба secure заавал таарах ёстой:** 465 → `true`, 587 → `false`.

Дараа нь серверийг дахин асаана:

```powershell
Restart-Service ShalgaltPlatform     # үйлчилгээ болгосон бол
# эсвэл pnpm dev-ээ зогсоогоод дахин асаана
```

### Шалгах

```powershell
# Зөвхөн холболт
pnpm --filter @shalgalt/api email:check

# Туршилтын захиа илгээх
pnpm --filter @shalgalt/api email:check -- purevdoctor@gmail.com
```

Эсвэл вэбээс: **админаар нэвтрэх → `/admin/users` → «Имэйлийн тохиргоо (SMTP)»**
хэсэгт төлөв харагдана, «Туршилтын захиа илгээх» товч бий.

### Түгээмэл алдаа

| Алдаа                  | Утга                                | Шийдэл                             |
| ---------------------- | ----------------------------------- | ---------------------------------- |
| `ECONNREFUSED`         | SMTP сервер ажиллахгүй / хаяг буруу | `SMTP_HOST`, `SMTP_PORT`-ыг шалгах |
| `EAUTH` / `535`        | Нэр/нууц үг буруу                   | Gmail бол **App Password** ашиглах |
| `ETIMEDOUT`            | Галт хана 465/587 портыг хаасан     | Сүлжээний админд хандах            |
| `wrong version number` | secure/порт таарахгүй               | 465→`true`, 587→`false`            |
| `ENOTFOUND`            | Серверийн нэр буруу                 | `SMTP_HOST`-ыг шалгах              |

> **LAN горим:** сервер интернэттэй холбогдоогүй бол имэйл явахгүй. Тайлан
> `emailQueue`-д `pending` төлөвтэй хадгалагдаж, интернэт орж ирэхэд
> автоматаар илгээгдэнэ.

---

## 6. HTTPS ба камерын хязгаарлалт

### Одоогийн байдал (HTTP)

`http://192.168.1.50:8080` дээр браузерын **secure-context** дүрмээр камерын хандалт
хаагддаг. Энэ нь юунд нөлөөлөх вэ:

| Функц                             | HTTP LAN дээр   | Тайлбар                                                             |
| --------------------------------- | --------------- | ------------------------------------------------------------------- |
| Сурагч QR уншиж шалгалт өгөх      | ✅ **Ажиллана** | Утасны үндсэн камерын апп линкийг нээнэ — вэб апп-ын камер хэрэггүй |
| Шалгалт өгөх, дүн харах           | ✅ Ажиллана     |                                                                     |
| Тайлан, .docx, имэйл              | ✅ Ажиллана     |                                                                     |
| Багшийн "Хариулт цуглуулах" камер | ❌ Ажиллахгүй   | Зөвхөн `offlineQr` горимд хэрэгтэй — LAN горимд ашиглахгүй          |
| PWA-г "Home screen-д нэмэх"       | ❌ Ажиллахгүй   | LAN дотор сервер байнга байдаг тул шаардлагагүй                     |

**Дүгнэлт:** LAN горимд HTTP бүрэн хангалттай. HTTPS зөвхөн дараах тохиолдолд хэрэгтэй:
`offlineQr` горим ашиглах, эсвэл сурагчид апп-ыг офлайн суулгах.

### HTTPS хэрэгтэй бол — mkcert (дотоод сүлжээнд)

```powershell
# 1. mkcert суулгах (Chocolatey эсвэл гараар: https://github.com/FiloSottile/mkcert)
choco install mkcert

# 2. Дотоод CA үүсгэх
mkcert -install

# 3. Серверийн IP-д гэрчилгээ гаргах
cd C:\Users\purev.b\burtgel-web\shalgalt-platform
mkdir certs
mkcert -cert-file certs\cert.pem -key-file certs\key.pem 192.168.1.50 shalgalt.local localhost
```

Дараа нь **төхөөрөмж бүр дээр** `mkcert -CAROOT` хавтас доторх `rootCA.pem`-ыг
суулгах шаардлагатай. 1000 сурагчийн утсанд үүнийг хийх нь бодит бус тул
**сургуулийн жинхэнэ домэйнтэй байвал л** HTTPS утга учиртай (доорх §9-ийг үзнэ үү).

---

## 7. Өгөгдлийн сан: SQLite эсвэл PostgreSQL

Суулгах скрипт анхдагчаар **SQLite** ашигладаг. Энэ нь ихэнх сургуульд хангалттай.

### Хэзээ SQLite хангалттай вэ

| Нөхцөл                                     | SQLite                               |
| ------------------------------------------ | ------------------------------------ |
| Нэг үед 1–2 анги (≤80 сурагч) шалгалт өгнө | ✅ Тохиромжтой                       |
| Нийт 1000 сурагчийн өгөгдөл хадгална       | ✅ Тохиромжтой                       |
| Хэмжигдсэн гүйцэтгэл                       | 30 зэрэгцээ илгээлт → p95 **250 мс** |

### Хэзээ PostgreSQL руу шилжих вэ

- Нэг үед **3-аас олон анги** (100+ сурагч) зэрэг шалгалт өгдөг болвол
- Логт `SQLITE_BUSY` / "database is locked" алдаа гарч эхэлбэл
- Хэдэн жилийн өгөгдөл хуримтлагдаж сан 2 GB давбал

### PostgreSQL руу шилжих

```powershell
# 1. PostgreSQL 16 суулгах: https://www.postgresql.org/download/windows/
#    Суулгах явцад postgres хэрэглэгчийн нууц үгийг тэмдэглэж авна.

# 2. Сан үүсгэх
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres shalgalt

# 3. Одоогийн өгөгдлийг нөөцлөх
.\scripts\backup.ps1

# 4. .env засах
notepad .env
```

`.env` дотор:

```ini
DATABASE_PROVIDER=postgresql
DATABASE_URL="postgresql://postgres:НУУЦҮГ@localhost:5432/shalgalt?schema=public"
```

```powershell
# 5. Migration + дахин асаах
pnpm db:deploy
Restart-Service ShalgaltPlatform
```

> ⚠ Энэ нь **хоосон сан** үүсгэнэ. Хуучин SQLite өгөгдлийг шилжүүлэх шаардлагатай бол
> эхлээд CSV экспорт хийж (багшийн самбар → CSV татах) хадгална уу.

---

## 8. Нөөцлөлт ба арчилгаа

### Өдөр бүр автоматаар нөөцлөх

Админ PowerShell дээр **нэг удаа** ажиллуулна:

```powershell
$repo    = 'C:\Users\purev.b\burtgel-web\shalgalt-platform'
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
             -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$repo\scripts\backup.ps1`" -Destination D:\Backup\shalgalt"
$trigger = New-ScheduledTaskTrigger -Daily -At 23:30
Register-ScheduledTask -TaskName 'Shalgalt нөөцлөлт' -Action $action -Trigger $trigger -RunLevel Highest
```

Гараар нөөцлөх:

```powershell
.\scripts\backup.ps1
.\scripts\backup.ps1 -Destination D:\Backup\shalgalt -KeepDays 90
```

> 💡 Нөөцийг **өөр диск эсвэл сүлжээний дискэнд** хадгална. Ижил диск дээр
> нөөцлөх нь диск гэмтэхэд ямар ч тус болохгүй.

### Сар бүрийн шалгах жагсаалт

- [ ] `Get-Service ShalgaltPlatform` — Running эсэх
- [ ] `logs\service-error.log` — шинэ алдаа байгаа эсэх
- [ ] Нөөц бодитоор үүсэж байгаа эсэх (`backups\` доторх огноо)
- [ ] Дискний сул зай ≥ 5 GB
- [ ] Windows шинэчлэлт (дахин асаасны дараа үйлчилгээ автоматаар эхэлсэн эсэхийг шалгах)

### Аппликейшныг шинэчлэх

```powershell
cd C:\Users\purev.b\burtgel-web\shalgalt-platform

.\scripts\backup.ps1              # 1. эхлээд нөөцлөх
Stop-Service ShalgaltPlatform     # 2. зогсоох

# 3. шинэ код авах (git ашиглаж байгаа бол)
git pull

pnpm install                      # 4. хамаарал
pnpm db:deploy                    # 5. шинэ migration
pnpm build                        # 6. дахин build

Start-Service ShalgaltPlatform    # 7. асаах
Invoke-RestMethod http://localhost:8080/api/health
```

> ⚠ **IP эсвэл порт өөрчлөгдвөл** заавал `pnpm build` дахин хийнэ —
> QR кодод хаяг build үед шингэдэг. Эс бөгөөс хуучин QR буруу хаяг заана.
> Хамгийн хялбар нь `setup-server.ps1`-ыг дахин ажиллуулах.

---

## 9. Интернэтэд гаргах

Сургуулиас гадуур (гэрээс) хандах шаардлагатай бол хоёр зам байна.

### А. Cloudflare Tunnel — үнэгүй, гадаад IP шаардахгүй

Одоо байгаа серверээ өөрчлөхгүйгээр интернэтэд гаргана. HTTPS автоматаар ирнэ
(камер, PWA бүрэн ажиллана).

```powershell
# 1. cloudflared суулгах
winget install --id Cloudflare.cloudflared

# 2. Нэвтрэх (браузер нээгдэнэ, домэйнээ сонгоно)
cloudflared tunnel login

# 3. Туннель үүсгэх
cloudflared tunnel create shalgalt

# 4. Домэйн холбох
cloudflared tunnel route dns shalgalt shalgalt.tanai-domain.mn

# 5. Windows Service болгох
cloudflared tunnel --url http://localhost:8080 run shalgalt
cloudflared service install
```

Дараа нь `.env` засаад **дахин build** хийнэ:

```ini
WEB_ORIGIN=https://shalgalt.tanai-domain.mn
VITE_PUBLIC_APP_URL=https://shalgalt.tanai-domain.mn
```

```powershell
pnpm build
Restart-Service ShalgaltPlatform
```

> Сургуулийн домэйн (`.edu.mn`) байхгүй бол Cloudflare дээр домэйн бүртгүүлэх
> шаардлагатай (жилд ~$10).

### Б. Түрээсийн сервер (VPS)

`docker-compose.yml` бэлэн байгаа тул Linux VPS дээр:

```bash
git clone <repo> && cd shalgalt-platform
cp .env.example .env && nano .env     # POSTGRES_PASSWORD, SMTP, VITE_PUBLIC_APP_URL
docker compose up -d --build
```

HTTPS-д Caddy эсвэл nginx + Let's Encrypt нэмнэ. Сард ~$5.

### ⚠ Интернэтэд гаргахын өмнө

| Зүйл                                | Яагаад                                    |
| ----------------------------------- | ----------------------------------------- |
| `RATE_LIMIT_MAX`-ыг бууруулах       | Гаднаас ирэх хэт олон хүсэлтээс хамгаална |
| PostgreSQL руу шилжих               | Интернэтийн ачаалалд SQLite тохиромжгүй   |
| Нөөцлөлтийг заавал тохируулах       |                                           |
| Багшийн токен алдагдахаас сэргийлэх | Токен нь цорын ганц хамгаалалт            |

---

## 10. Асуудал шийдэх

### `ERR_CONNECTION_REFUSED`

Сервер ажиллаагүй байна.

```powershell
Get-Service ShalgaltPlatform
Start-Service ShalgaltPlatform
Get-Content logs\service-error.log -Tail 30
```

### Өөр компьютерээс нээгдэхгүй (сервер дээрээ ажиллаж байгаа ч)

```powershell
# 1. Firewall дүрэм байгаа эсэх
Get-NetFirewallRule -DisplayName '*Shalgalt*' | Select-Object DisplayName, Enabled, Profile

# 2. Сүлжээний профайл Public бол Private болгоно
Get-NetConnectionProfile
Set-NetConnectionProfile -InterfaceAlias 'Ethernet' -NetworkCategory Private

# 3. 0.0.0.0 дээр сонсож байгаа эсэх (127.0.0.1 биш)
Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object LocalAddress, LocalPort
```

`LocalAddress` нь `0.0.0.0` байх ёстой. Эс бөгөөс `.env` дотор `API_HOST=0.0.0.0` эсэхийг шалгана.

### QR код буруу хаяг заана

IP эсвэл порт өөрчлөгдсөн байна. `.env`-ийн `VITE_PUBLIC_APP_URL`-ыг зөв болгоод:

```powershell
pnpm build
Restart-Service ShalgaltPlatform
```

Хэвлэсэн QR-уудыг дахин хэвлэнэ.

### Имэйл илгээгдэхгүй

```powershell
# Логоос SMTP алдаа хайх
Select-String -Path logs\service*.log -Pattern 'SMTP|mail|EAUTH|ECONNECTION'
```

- Gmail: **App Password** ашигласан эсэх (энгийн нууц үг ажиллахгүй)
- Порт 465 → `SMTP_SECURE=true`, порт 587 → `false`
- Сервер интернэттэй холбогдсон эсэх (LAN зөвхөн дотоод бол имэйл явахгүй)
- Илгээгдээгүй тайлан **дараалалд хадгалагдана** — интернэт орж ирэхэд автоматаар явна

### "database is locked"

Нэг үед хэт олон сурагч илгээж байна → [PostgreSQL руу шилжинэ](#7-өгөгдлийн-сан-sqlite-эсвэл-postgresql).

### Үйлчилгээ эхлээд шууд унтарна

```powershell
Get-Content logs\service-error.log -Tail 50
```

Түгээмэл шалтгаан:

| Алдаа                                          | Шийдэл                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `EADDRINUSE`                                   | Порт завгүй — `Get-NetTCPConnection -LocalPort 8080 -State Listen` |
| `Environment variable not found: DATABASE_URL` | `.env` байхгүй эсвэл гэмтсэн — `setup-server.ps1` дахин ажиллуулна |
| `index.html олдсонгүй`                         | `pnpm build` хийгээгүй                                             |
| `P1003` (Prisma)                               | `pnpm db:deploy` ажиллуулна                                        |

### Цахилгаан тасарсны дараа

Үйлчилгээ автоматаар эхэлнэ. Гэхдээ шалгана:

```powershell
Get-Service ShalgaltPlatform
Invoke-RestMethod http://localhost:8080/api/health
```

Хэрэв сан гэмтсэн бол хамгийн сүүлийн нөөцөөс сэргээнэ:

```powershell
Stop-Service ShalgaltPlatform
Copy-Item backups\<огноо>\prod.db apps\api\prisma\prod.db -Force
Start-Service ShalgaltPlatform
```

---

## Товч тэмдэглэл

```
Хаяг         : http://192.168.1.50:8080
Үйлчилгээ    : ShalgaltPlatform
Хавтас       : C:\Users\purev.b\burtgel-web\shalgalt-platform
Лог          : logs\service.log
Нөөц         : backups\  (өдөр бүр 23:30)
Тохиргоо     : .env      (зассаны дараа Restart-Service)
```
