# YOLPOL

[English](README.md) | [فارسی](README.fa.md)

YOLPOL یک پلتفرم چندزبانه و SEO-first برای تأمین و فروش عمده B2B است. کاتالوگ عمومی فعلی آن بر بطری‌های شیشه‌ای خالی و بسته‌بندی شیشه‌ای عمده برای کاربردهای روغن زیتون، مواد غذایی و نوشیدنی تمرکز دارد. این پروژه از زبان‌های `en`، `tr`، `fa` و `ar` پشتیبانی می‌کند؛ فارسی و عربی به‌صورت RTL و انگلیسی و ترکی به‌صورت LTR نمایش داده می‌شوند.

مدل تجاری سایت فقط مبتنی بر استعلام است: قیمت‌های داخلی Product در سایت عمومی منتشر نمی‌شوند و checkout، پرداخت یا خرید مستقیم آنلاین وجود ندارد. معماری برای self-hosting طراحی شده و بر Server Componentهای ایستا، مسیرهای قابل‌خزش با پیشوند زبان و مرزهای عملیاتی صریح تکیه دارد.

مخزن فعلی شامل runtime سالم و مستقل Production و مسیر احراز‌شده انتشار از Staging به Production است. این وضعیت به معنی تکمیل cutover عمومی DNS/Cloudflare نیست؛ cutover نهایی عمومی، Production Monitoring، دوام backup خارج از سرور در Phase C2 و اثبات کامل disaster recovery روی سرور disposable همچنان کارهای جداگانه‌اند.

## قابلیت‌های اصلی

- کاتالوگ چندزبانه Product، صفحه‌های دسته‌بندی و جزئیات، metadata، sitemap و structured data.
- جریان عمومی استعلام عمده‌فروشی با اعتبارسنجی سمت سرور و persistence در PostgreSQL.
- برنامه‌ریزی لجستیک صادرات مبتنی بر pallet و اطلاعات بسته‌بندی تأییدشده.
- گفت‌وگوی ماندگار Customer، workflowهای Staff، یکپارچگی Telegram و مقصدهای اعلان قابل‌پیکربندی.
- ترجمه گفت‌وگو با provider قابل‌پیکربندی و AI fallback تحت policy، همراه با کنترل‌های fail-closed برای Operations و providerها.
- احراز هویت Staff، مدیریت تیم، onboarding تلگرام و ابزارهای محافظت‌شده provisioning.
- migrationهای صریح Drizzle، تست یکپارچه PostgreSQL، ابزار retention، اعتبارسنجی backup/restore و قراردادهای monitoring.
- release manifest تغییرناپذیر و خودکارسازی deployment مجزای Staging/Production با image digest و تأیید صریح Production.

قابلیت‌های به‌تعویق‌افتاده در بخش «محدودیت‌های فعلی و Roadmap» آمده‌اند. وجود یک پوشه، schema یا foundation به معنی فعال‌شدن عمومی یک قابلیت deferred نیست.

## پشته فناوری

نسخه‌ها و قراردادهای زیر مستقیماً از مخزن بررسی شده‌اند:

| فناوری | نسخه یا قرارداد |
| --- | --- |
| Next.js | `16.3.0` با App Router |
| React / React DOM | `19.2.8` |
| TypeScript | `^5` با strict mode |
| next-intl | `^4.13.6` |
| PostgreSQL | `17.6-alpine` با digest ثابت در Compose/Dockerfile |
| Drizzle ORM / Kit | `0.45.2` / `0.31.10` |
| pnpm | `11.14.0` |
| Node.js | نسخه `22` در CI و image اجرایی |
| Vitest | `^4.1.10` |
| Tailwind CSS | `^4` |
| Docker / Compose | Docker Engine یا Docker Desktop با Compose v2 |

## معماری

YOLPOL از Next.js App Router، Clean Architecture و Feature-Based Architecture استفاده می‌کند. entry pointهای framework نازک می‌مانند و composition rootها portهای application را به infrastructure متصل می‌کنند، بدون اینکه فایل‌های App Router مستقیماً به infrastructure هر feature وابسته شوند.

```text
src/
├── app/                 # routeهای نازک App Router و metadata فریم‌ورک
├── composition/         # composition rootهای صریح
├── features/            # featureهای کسب‌وکار
│   └── <feature>/
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       ├── presentation/
│       └── testing/
├── i18n/                # routing، navigation، request و messageهای زبان‌ها
└── shared/              # type، config و UI واقعاً مشترک
tooling/                 # workerها، provisioning، release، تست و عملیات
deploy/                  # قراردادها و runbookهای deployment هر محیط
drizzle/                 # migrationهای SQL صریح و بازبینی‌شده
docs/                    # معماری، roadmap، taskها و سوابق deployment
```

جهت dependencyها `presentation → application → domain` و `infrastructure → application/domain` است. کد domain و application مستقل از framework باقی می‌ماند و کد Production هرگز utilityهای testing یک feature را import نمی‌کند. هر feature کسب‌وکار پنج لایه دائمی و واقعی دارد؛ UI مشترک site shell به‌جای ایجاد لایه‌های مصنوعی، در shared presentation قرار می‌گیرد.

اطلاعات عمومی و غیرمحلی‌سازی‌شده برند، navigation و تماس در [`src/shared/config/site.ts`](src/shared/config/site.ts) نگهداری می‌شوند و labelهای قابل‌نمایش در فایل‌های message هر زبان قرار دارند. برای قواعد کامل boundary و dependency به [راهنمای معماری](docs/architecture/ARCHITECTURE.md) مراجعه کنید.

## بین‌المللی‌سازی

تمام زبان‌های عمومی پیشوند اجباری دارند:

| Locale | زبان | جهت |
| --- | --- | --- |
| `en` | انگلیسی | LTR |
| `tr` | ترکی | LTR |
| `fa` | فارسی | RTL |
| `ar` | عربی | RTL |

مرز next-intl در `src/i18n/routing.ts`، `navigation.ts`، `request.ts` و چهار message catalog تعریف شده است. layout ریشه محلی‌سازی‌شده locale را اعتبارسنجی می‌کند و `lang` و `dir` را تنظیم می‌کند. commandها، identifierها، واقعیت‌های Product و ترجمه رابط کاربری مسئولیت‌های جداگانه دارند.

## پیش‌نیازها

- Git.
- Node.js 22، مطابق CI و runtime image ثابت‌شده. در حال حاضر `package.json` بازه جداگانه‌ای برای `engines.node` ندارد.
- Corepack به‌همراه `pnpm 11.14.0`، مطابق `package.json`.
- Docker Engine یا Docker Desktop به‌همراه Docker Compose v2.
- آزادبودن پورت‌های محلی موردنیاز؛ معمولاً `3000` برای Next.js، `5432` برای PostgreSQL محیط Development و `55432` برای PostgreSQL disposable تست یکپارچه.

PostgreSQL محلی معمولاً با Docker Compose فراهم می‌شود و نصب جداگانه آن روی host لازم نیست.

## Clone و نصب

```powershell
git clone https://github.com/farhadesmaeili/YolPol.git
cd YolPol
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install
```

## پیکربندی محیط

فایل نادیده‌گرفته‌شده Development را بسازید:

```powershell
Copy-Item .env.example .env.local
```

`.env.local` فقط برای Development محلی است. Staging و Production با `NODE_ENV=production` اجرا می‌شوند و تنظیمات non-secret بازبینی‌شده و secretها را از process environment، Docker Secrets یا فایل‌های ثابت و محافظت‌شده host دریافت می‌کنند. این محیط‌ها `.env.local` توسعه‌دهنده را نمی‌خوانند.

password، database URL، bot token، webhook secret، provider key، private key یا credential واقعی host را هرگز commit نکنید. پیش از استفاده، همه credentialهای نمونه را جایگزین کنید.

متغیرهای [`.env.example`](.env.example) براساس مسئولیت دسته‌بندی شده‌اند:

- هویت deployment و origin عمومی runtime؛
- هویت و سطح structured logging؛
- PostgreSQL محلی و `DATABASE_URL`؛
- metadata عمومی Telegram bot و credentialهای server-only مربوط به bot/webhook؛
- کنترل‌های provider-neutral برای AI و ورودی credential مربوط به Groq؛
- فاصله polling برای workerهای long-running؛
- rate limitهای process-local؛
- تنظیمات مخصوص Development برای LAN و workerها؛
- تنظیمات PostgreSQL جداشده برای integration test.

جفت‌هایی مانند `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_TOKEN_FILE` و `GROQ_API_KEY` / `GROQ_API_KEY_FILE` در مرزهای پیاده‌سازی‌شده mutually exclusive هستند؛ دقیقاً یک منبع پشتیبانی‌شده را تنظیم کنید. credentialهای Development را در Staging یا Production کپی نکنید.

## PostgreSQL محلی و migrationها

database ماندگار Development را اجرا و وضعیت آن را بررسی کنید:

```powershell
docker compose up -d postgres
docker compose ps
```

`DATABASE_URL` باید یک URL کامل PostgreSQL برای database موردنظر باشد. اگر process از قبل این مقدار را فراهم نکرده باشد، commandهای Drizzle محیط Development محلی را بارگذاری می‌کنند.

```powershell
pnpm db:check
pnpm db:migrate
pnpm db:studio
```

فقط پس از تغییر عمدی schema از `pnpm db:generate` استفاده کنید. SQL تولیدشده و قرارداد schema باید پیش از پذیرش بازبینی شوند. migrationها artifactهای صریح و commit‌شده release هستند؛ startup برنامه یا worker آنها را اجرا نمی‌کند. برای Production از runtime schema push ناامن استفاده نکنید.

سرویس Development از volume نام‌دار `postgres_data` استفاده می‌کند. سرویس integration جدا، profile-gated، متصل به loopback و مبتنی بر `tmpfs` است. تست یا cleanup یکپارچه را هرگز به داده Development، Staging یا Production متصل نکنید.

## توسعه

برای اجرای برنامه محلی از `pnpm dev` استفاده کنید. برای تست LAN یا موبایل، `pnpm dev:host` سرور Development را روی `0.0.0.0` bind می‌کند. در صورت تست با دستگاه دیگر، `YOLPOL_DEV_ORIGIN` را فقط به همان origin مجاز Development تنظیم کنید؛ این متغیر نباید در Staging یا Production تنظیم شود.

## Workerهای Development

سرور Development مربوط به Next.js هیچ background workerای را اجرا نمی‌کند. هر worker موردنیاز را در terminal جداگانه اجرا کنید. wrapperهای Development پیش از import کردن composition مربوط به Production، محیط محلی را بارگذاری می‌کنند.

```powershell
# Terminal 1
pnpm dev

# Terminal 2
pnpm dev:inquiry-notifications

# Terminal 3
pnpm dev:conversation-translation

# Terminal 4
pnpm dev:ai-fallback
```

- `dev:inquiry-notifications` کارهای ماندگار اعلان inquiry و retryها را پردازش می‌کند.
- `dev:conversation-translation` کارهای صف‌شده ترجمه گفت‌وگو را پردازش می‌کند.
- `dev:ai-fallback` کارهای مجاز AI fallback را مطابق policy پردازش می‌کند.

اگر database، provider، deployment یا policy لازم در دسترس نباشد، workerها به‌صورت امن fail می‌شوند. credentialهای provider فقط server-side هستند.

## Commandهای Worker در Production

| Command | رفتار |
| --- | --- |
| `pnpm worker:inquiry-notifications` | worker long-running برای polling اعلان‌های inquiry. |
| `pnpm worker:inquiry-notifications:once` | پردازش یک batch محدود و سپس خروج. |
| `pnpm worker:conversation-translation` | worker long-running ترجمه گفت‌وگو. |
| `pnpm worker:conversation-translation:once` | پردازش یک batch محدود ترجمه و سپس خروج. |
| `pnpm worker:ai-fallback` | worker long-running برای AI fallback گفت‌وگو. |
| `pnpm worker:ai-fallback:once` | پردازش یک batch محدود AI fallback و سپس خروج. |

commandهای Production فقط از environment استفاده می‌کنند و `.env.local` را بارگذاری نمی‌کنند. قراردادهای Compose مستقرشده lifecycle عادی workerهای زنده را مدیریت می‌کنند؛ اپراتور نباید با اجرای دستی processهای ad hoc این قراردادها را دور بزند. commandهای `:once` برای diagnostic کنترل‌شده یا اجرای one-shot صریحاً مدیریت‌شده‌اند.

## Provisioning حساب Staff و Super Admin

هر دو ابزار به TTY تعاملی واقعی و دسترسی database از طریق `DATABASE_URL` نیاز دارند و هیچ argument خط فرمانی نمی‌پذیرند. ورودی password مخفی است و چاپ نمی‌شود. این commandها را فقط در terminal مورداعتماد اپراتور یا operation ثابت deployment برای محیط مقصد اجرا کنید؛ نه هنگام install، build، migration، startup برنامه یا CI.

```powershell
pnpm staff:provision
```

این command شناسه Team Member، نام نمایشی، email ورود، role، password و تکرار آن و تأیید نهایی را می‌پرسد. مجموعه roleهای domain شامل `SUPER_ADMIN`، `ADMIN`، `SALES` و `VIEWER` است، اما provisioning مستقیم عمداً فقط `ADMIN` یا `SALES` را می‌پذیرد. invariantهای Team Member و account بررسی می‌شوند، password با adapter امنیتی موجود hash می‌شود و conflict یا خطای dependency/persistence به‌صورت fail-closed مدیریت می‌شود.

```powershell
pnpm staff:bootstrap-super-admin
```

این bootstrap یک‌باره، شناسه یک Staff Account موجود را می‌گیرد و فقط یک `ADMIN` فعال متصل به Team Member فعال را به `SUPER_ADMIN` ارتقا می‌دهد. اگر `SUPER_ADMIN` از قبل وجود داشته باشد، bootstrap دوم رد می‌شود. این command account جدید نمی‌سازد و credential را به‌صورت argument نمی‌پذیرد.

عملیات Staff در Production با worker image تغییرناپذیر و از طریق deployment wrapper محدود و تعاملی اجرا می‌شوند. stdin/stdout/stderr باید TTY واقعی باشند و اپراتور دسترسی دلخواه Docker یا root دریافت نمی‌کند. روش معتبر محیط زنده در [راهنمای عملیات deployment](deploy/operations/README.md) آمده است.

## ابزار Telegram

```powershell
pnpm telegram:webhook:set
pnpm telegram:webhook:info
```

`telegram:webhook:set` endpoint ثابت HTTPS یعنی `/api/webhooks/telegram` را ثبت می‌کند، pending updateها را حفظ می‌کند و به bot token، webhook secret و `TELEGRAM_WEBHOOK_PUBLIC_ORIGIN` نیاز دارد. `telegram:webhook:info` URL ثبت‌شده در Telegram را با URL موردانتظار مقایسه می‌کند و به bot token و public origin نیاز دارد؛ خروجی diagnostic اطلاعات حساس یا ناامن provider را redact می‌کند.

public origin باید یک HTTPS origin مطلق و بدون credential، path، query یا fragment باشد. این commandها positional argument نمی‌پذیرند. در Development می‌توانند فایل‌های environment نادیده‌گرفته‌شده را بخوانند، اما credential زنده باید از قرارداد secret بازبینی‌شده Production تأمین شود. این عملیات با Telegram ارتباط برقرار می‌کنند و state provider را تغییر می‌دهند یا می‌خوانند؛ بنابراین فقط در محیط موردنظر اجرا شوند.

## Retention استعلام‌ها

`pnpm retention:inquiries` به `DATABASE_URL` نیاز دارد و ریشه Inquiryهایی را که strictly قدیمی‌تر از cutoff بیست‌وچهارماهه UTC هستند حذف می‌کند؛ ردیف‌های وابسته Product snapshot مطابق foreign-key cascade حذف می‌شوند. این یک operation مخرب، کنترل‌شده و one-shot است و هنگام rendering، submission، migration یا startup worker اجرا نمی‌شود.

وجود command به معنی فعال‌بودن schedule نیست. زمان‌بندی Production و alert در صورت شکست همچنان مسئولیت صریح عملیات است؛ پیش از فعال‌سازی یا تغییر schedule، سوابق privacy/operations مرتبط را بررسی کنید.

## تست و کنترل کیفیت

| Command | محدوده اعتبارسنجی | نیاز به Docker |
| --- | --- | --- |
| `pnpm lint` | قواعد ESLint مخزن. | خیر |
| `pnpm typecheck` | بررسی strict TypeScript بدون emit. | خیر |
| `pnpm test` | مجموعه اصلی unit/component/contract در Vitest. | خیر |
| `pnpm build` | build مربوط به Production در Next.js و integration فریم‌ورک. | خیر |
| `pnpm test:integration` | تست یکپارچه محافظت‌شده PostgreSQL فقط با `postgres-test`. | بله |
| `pnpm test:backup-restore` | build کردن target به نام `operations-test` و اجرای تست shell. | بله |
| `pnpm test:backup-restore:disposable` | تست end-to-end و disposable برای backup رمزگذاری‌شده، verify و restore. | بله |
| `pnpm test:monitoring` | تست قرارداد monitoring و Operations Metrics در Vitest. | خیر |
| `pnpm test:monitoring:disposable` | stack disposable monitoring با PostgreSQL و health endpoint مصنوعی. | بله |
| `pnpm test:deployment` | تست policy مربوط به deployment/Compose؛ پوشش کامل مدل resolved به Compose نیاز دارد. | Compose برای پوشش کامل |
| `pnpm test:control-plane` | تست‌های Python برای control plane و تست Vitest مربوط به release deployment. | خیر |
| `pnpm test:deployment:disposable` | اعتبارسنجی ایزوله Linux برای wrapper، bootstrap و امنیت. | بله |
| `pnpm test:bootstrap` | تست قرارداد server bootstrap. | خیر |
| `pnpm test:release` | تست قرارداد manifest، workflow و امنیت release. | خیر |

commandهای disposable فقط container، network، image یا storage موقت مخصوص harness خود را می‌سازند. آنها را با operationهای گسترده‌ای مانند `docker compose down -v` جایگزین نکنید و به محیط ماندگار متصل نکنید.

## مرجع Scriptها

همه ۴۲ script فعلی `package.json` در جدول زیر آمده‌اند.

| Command | کاربرد | محیط معمول |
| --- | --- | --- |
| `pnpm dev` | اجرای سرور محلی Next.js در Development. | توسعه محلی |
| `pnpm dev:host` | اجرای Development روی `0.0.0.0`. | تست LAN/موبایل |
| `pnpm build` | ساخت build مربوط به Production. | CI/release |
| `pnpm start` | اجرای سرور Next.js که قبلاً build شده است. | بررسی محلی Production-mode |
| `pnpm lint` | اجرای ESLint. | quality gate |
| `pnpm typecheck` | اجرای `tsc --noEmit`. | quality gate |
| `pnpm test` | اجرای یک‌باره مجموعه اصلی Vitest. | quality gate |
| `pnpm test:integration` | تست یکپارچه PostgreSQL با lifecycle محافظت‌شده. | اعتبارسنجی Docker |
| `pnpm test:backup-restore` | اجرای target تست image مربوط به backup/restore. | تست عملیات با Docker |
| `pnpm test:backup-restore:disposable` | تمرین disposable برای backup/restore رمزگذاری‌شده. | اعتبارسنجی عمیق Docker |
| `pnpm test:monitoring` | تست unit/contract مربوط به monitoring. | توسعه monitoring |
| `pnpm test:monitoring:disposable` | تمرین stack disposable مربوط به monitoring. | اعتبارسنجی عمیق Docker |
| `pnpm test:deployment` | تست deployment و Compose policy. | توسعه deployment |
| `pnpm test:control-plane` | تست Python و TypeScript مربوط به control plane. | gate امنیت deployment |
| `pnpm test:deployment:disposable` | تمرین سطح محدود deployment روی Linux. | اعتبارسنجی عمیق Docker |
| `pnpm test:bootstrap` | تست قرارداد bootstrap. | توسعه bootstrap |
| `pnpm test:release` | تست قرارداد و workflow مربوط به release. | توسعه release |
| `pnpm db:generate` | تولید SQL پس از تغییر عمدی schema در Drizzle. | فقط توسعه schema |
| `pnpm db:migrate` | اعمال migrationهای commit‌شده به database انتخاب‌شده. | migration صریح |
| `pnpm db:check` | بررسی سازگاری migrationهای Drizzle. | پیش از migration/review |
| `pnpm db:studio` | اجرای Drizzle Studio برای database انتخاب‌شده. | بررسی کنترل‌شده Development |
| `pnpm retention:inquiries` | حذف Inquiryهای قدیمی‌تر از cutoff بیست‌وچهارماهه. | operation کنترل‌شده database |
| `pnpm staff:provision` | provisioning تعاملی account با role `ADMIN` یا `SALES`. | TTY مورداعتماد |
| `pnpm staff:bootstrap-super-admin` | ارتقای یک‌باره `ADMIN` واجد شرایط. | TTY مورداعتماد/bootstrap |
| `pnpm dev:inquiry-notifications` | اجرای worker اعلان inquiry در Development. | terminal محلی جدا |
| `pnpm dev:conversation-translation` | اجرای worker ترجمه در Development. | terminal محلی جدا |
| `pnpm dev:ai-fallback` | اجرای worker مربوط به AI fallback در Development. | terminal محلی جدا |
| `pnpm worker:inquiry-notifications` | polling پیوسته اعلان در حالت Production-style. | runtime مدیریت‌شده |
| `pnpm worker:inquiry-notifications:once` | پردازش یک batch اعلان. | one-shot کنترل‌شده |
| `pnpm worker:conversation-translation` | polling پیوسته ترجمه در حالت Production-style. | runtime مدیریت‌شده |
| `pnpm worker:conversation-translation:once` | پردازش یک batch ترجمه. | one-shot کنترل‌شده |
| `pnpm worker:ai-fallback` | polling پیوسته AI fallback در حالت Production-style. | runtime مدیریت‌شده |
| `pnpm worker:ai-fallback:once` | پردازش یک batch از AI fallback. | one-shot کنترل‌شده |
| `pnpm telegram:webhook:set` | ثبت webhook ثابت Telegram. | operation کنترل‌شده provider |
| `pnpm telegram:webhook:info` | بررسی و مقایسه state مربوط به webhook. | diagnostic کنترل‌شده provider |
| `pnpm release:validate-tag` | اعتبارسنجی قرارداد SemVer برای release tag. | آماده‌سازی release |
| `pnpm release:migration-fingerprint` | محاسبه fingerprint مجموعه migrationهای commit‌شده. | آماده‌سازی manifest/release |
| `pnpm release:manifest:generate` | تولید manifest سخت‌گیرانه از ورودی‌های تأییدشده. | workflow انتشار |
| `pnpm release:manifest:validate` | اعتبارسنجی schema و قواعد repository برای manifest. | verify انتشار |
| `pnpm release:manifest:checksum` | محاسبه checksum مربوط به manifest. | ساخت artifact انتشار |
| `pnpm release:manifest:verify` | بررسی جفت manifest/checksum. | gate احراز و promotion |
| `pnpm release:rollback:plan` | مقایسه manifestها و تولید برنامه سازگاری rollback. | برنامه‌ریزی بازبینی‌شده rollback |

## ابزار Release

CLI مربوط به release یک قرارداد سخت‌گیرانه و repository-owned برای artifactها پیاده‌سازی می‌کند. release manifest نسخه/tag، full Git SHA، source repository، platform، migration fingerprint و هر پنج image role را به reference تغییرناپذیر `repository@sha256:digest` متصل می‌کند. checksum خرابی داده را تشخیص می‌دهد، اما احراز هویت همچنان به انتخاب GitHub Release مورداعتماد و هویت دقیق source توسط control plane بازبینی‌شده وابسته است.

الگوی promotion چنین است: `BUILD ONCE → IDENTIFY BY DIGEST → TEST IN STAGING → APPROVE → PROMOTE THE SAME DIGEST TO PRODUCTION`. در Production نه source آزمایش‌شده Staging دوباره build می‌شود و نه tag قابل‌تغییر جای digest را می‌گیرد. rollback planner فقط یک compatibility plan تولید می‌کند و Docker، PostgreSQL، migration، restore یا network operation اجرا نمی‌کند.

برای argumentها، فیلدهای manifest، gateهای promotion و مدیریت rollback به [Release and Rollback Operations](deploy/release/README.md) مراجعه کنید.

## نمای کلی Deployment

```text
GitHub Release
→ اعتبارسنجی احراز‌شده manifest، tag، commit و OIDC
→ deployment خودکار Staging
→ بررسی health، readiness و smoke
→ promotion صریح و تأییدشده Production
→ deployment دقیق و immutable در Production بدون rebuild
```

release `v0.2.2` در commit `48a566142bd0259c596314f6a01a92cc66d868ce` مسیر احراز‌شده runtime از Staging به Production را با موفقیت طی کرده است. runtime مربوط به Production provision شده و سالم است، اما deployment runtime از فعال‌سازی عمومی DNS/Cloudflare جداست و مخزن cutover نهایی عمومی را تکمیل‌شده ثبت نمی‌کند.

Staging و Production دارای database، volume، credential، runtime file، release authority، تنظیمات Telegram/provider و deployment state مستقل هستند. root مالک release authority، secretها، policy، lock، journal و wrapper محدود است. اپراتور عادی نه دسترسی نامحدود Docker دارد و نه shell عمومی root.

gateهای عملیاتی زیر همچنان fail-closed باقی می‌مانند:

- دوام backup خارج از سرور و با تأیید مستقل در Phase C2 کامل نشده است.
- migration fingerprint تغییریافته برای Production با `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` رد می‌شود.
- Production Monitoring جدا و غیرفعال/ناکامل است؛ پروژه Monitoring فعلی مخصوص Staging است.
- automatic restore وجود ندارد.
- disposable rebuild و اثبات کامل disaster recovery کامل نشده‌اند.
- cutover نهایی عمومی DNS/Cloudflare نیازمند بازبینی و کنترل جداگانه است.

برای عملیات حساس یا مخرب از runbookهای [bootstrap](deploy/bootstrap/README.md)، [control plane](deploy/control-plane/README.md)، [operations](deploy/operations/README.md)، [Production](deploy/production/README.md) و [monitoring](deploy/monitoring/README.md) شروع کنید. این اسناد مرجع معتبر عملیات هستند.

## Workflow شاخه و مشارکت

```text
develop
→ شاخه اختصاصی feature/fix/docs
→ pull request بازبینی‌شده به develop
→ آماده‌سازی release
→ pull request بازبینی‌شده develop → main
→ version tag و GitHub Release
→ همگام‌سازی ancestry پس از release، در صورت نیاز
```

برای هر feature، fix یا کار مستندسازی یک شاخه اختصاصی استفاده کنید و مستقیماً روی `main` کار نکنید. پیش از تغییر، branch، HEAD و worktree را بررسی کنید. commit، push، tag و promotion باید آگاهانه و بازبینی‌شده باشند. این بخش workflow پروژه را توضیح می‌دهد و ادعایی درباره تنظیمات تأییدنشده branch protection در GitHub ندارد.

## مرزهای امنیتی

- secret را در Git، image، manifest، command argument، log یا client bundle عمومی ذخیره نکنید.
- secret زنده فقط از process environment بازبینی‌شده، Docker Secrets یا فایل secret تحت کنترل root تأمین شود.
- credentialهای Development، integration، Staging، Production، Monitoring و سرویس‌های آینده را جدا نگه دارید.
- پورت `5432` مربوط به PostgreSQL را در اینترنت عمومی expose نکنید؛ ترافیک database برنامه باید روی network خصوصی بماند.
- مدل فروش inquiry-only را حفظ کنید و قیمت داخلی Product را در سایت عمومی نمایش ندهید.
- مسیرهای trusted release، manifestها، قراردادهای runtime، journalها و deployment policy را authority تحت کنترل root در نظر بگیرید.
- imageهای runtime پروژه فقط با digest تغییرناپذیر deploy شوند.
- به اپراتور عادی دسترسی نامحدود Docker، Compose، shell، systemd، مدیریت database یا root ندهید.
- `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`، migration review، backup verification یا approval gate را دور نزنید.
- از سالم‌بودن container یا موفقیت deployment در Production، فعال‌شدن عمومی را نتیجه نگیرید.

## مستندات پروژه

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Roadmap](docs/roadmap/ROADMAP.md)
- [Server bootstrap](deploy/bootstrap/README.md)
- [Authenticated deployment control plane](deploy/control-plane/README.md)
- [Deployment operations](deploy/operations/README.md)
- [Release and rollback](deploy/release/README.md)
- [Staging operations](deploy/staging/README.md)
- [Production operations](deploy/production/README.md)
- [Monitoring](deploy/monitoring/README.md)
- [سوابق تأییدشده deployment](docs/deployments/)

مستندات سطح اول برای onboarding و آشنایی‌اند. برای operationهای محیط زنده، مخرب، دارای credential یا تحت کنترل root حتماً runbook اختصاصی را دنبال کنید.

## رفع اشکال

### PostgreSQL در دسترس نیست

`docker compose ps` را اجرا کنید و سپس فقط سرویس Development را با `docker compose up -d postgres` بالا بیاورید. منتظر health check بمانید. برای رفع اشکال از commandهای گسترده حذف volume استفاده نکنید.

### `DATABASE_URL` وجود ندارد یا نامعتبر است

در Development مطمئن شوید `.env.local` وجود دارد و URL کامل PostgreSQL شامل protocol، host، user، password و نام database است. همچنین محیط مقصد command را بررسی کنید. URL زنده را در source، issue output یا shell history قرار ندهید.

### بررسی migration شکست می‌خورد

`pnpm db:check` را اجرا و schemaهای Drizzle و فایل‌های SQL commit‌شده را بررسی کنید. ناسازگاری باید عمدی و مستقیم حل شود؛ برای عبور اجباری از تست از schema push، حذف migration history یا تولید دوباره migrationهای نامرتبط استفاده نکنید.

### پورت در حال استفاده است

بررسی کنید چه process یا containerای مالک `3000`، `5432` یا `55432` است. فقط process مربوط به Development/disposable را متوقف کنید یا متغیر محلی پشتیبانی‌شده را تغییر دهید. برای حل تعارض محلی، پورت‌های deployment زنده را تغییر ندهید.

### تست integration یا disposable به Docker دسترسی ندارد

از اجرای Docker و موفقیت `docker compose version` مطمئن شوید. تست integration از lifecycle lock و پورت ثابت و ایزوله استفاده می‌کند؛ در هر لحظه فقط یک suite یکپارچه اجرا کنید. پیش از حذف container، network، image یا volume، harness شکست‌خورده را بررسی کنید.

### Worker پیکربندی provider را پیدا نمی‌کند

وجود database، deployment environment و منبع secret لازم برای Telegram/Groq را بررسی کنید. wrapperهای Development فایل‌های env محلی را بارگذاری می‌کنند، اما commandهای Production-style این کار را نمی‌کنند. نبودن یا نامعتبر بودن تنظیمات provider عمداً باعث fail-closed می‌شود.

### Build یا typecheck شکست می‌خورد

از Node.js 22 و pnpm `11.14.0` استفاده کنید، `pnpm install` را با lockfile commit‌شده اجرا کنید و سپس کوچک‌ترین command شکست‌خورده را مستقیم اجرا کنید. علت type، lint، test یا framework را حل کنید و error را suppress نکنید.

## محدودیت‌های فعلی و Roadmap

کارهای باقی‌مانده‌ای که در وضعیت فعلی تأیید شده‌اند عبارت‌اند از:

- دوام backup خارج از سرور در Phase C2 و gate مرتبط با migrationهای Production؛
- فعال‌سازی Production Monitoring و تشخیص مستقل خرابی بیرونی؛
- cutover نهایی و بازبینی‌شده عمومی DNS/Cloudflare؛
- disposable rebuild و اثبات کامل disaster recovery؛
- بازبینی محتوای همه زبان‌ها؛
- اعتبارسنجی accessibility، performance، SEO و end-to-end؛
- distributed abuse control، idempotency بین clientها برای inquiry و مواردی که صریحاً در roadmap deferred شده‌اند؛
- persistence عمومی Product، پرداخت، CMS، کاتالوگ/dashboard مدیریتی و customer-acquisition automation.

در حال حاضر analytics tracker فعالی وجود ندارد. برای scope و ترتیب اجرا به [roadmap](docs/roadmap/ROADMAP.md) مراجعه کنید و کار برنامه‌ریزی‌شده را پیاده‌سازی‌شده یا فعال تلقی نکنید.
