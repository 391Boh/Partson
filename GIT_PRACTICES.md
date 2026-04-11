# Правила безпечної роботи з Git

## ❌ Небезпечно — НЕ використовувати

```bash
git reset --hard <commit>  # стирає коміти назавжди (локально)
```

## ✅ Безпечно — використовувати натомість

```bash
git revert <commit>        # створює новий коміт що скасовує зміни
```

---

## 🛡️ Перед будь-яким "поверненням" — створюй backup-гілку

```bash
git branch backup-$(date +%Y%m%d)
git push origin backup-$(date +%Y%m%d)
```

---

## 🔁 Push після кожного значного коміту

```bash
git add .
git commit -m "опис змін"
git push origin main
```

> **Якщо коміт є на GitHub — він не може бути втрачений локальними командами.**

---

## 🌿 Використовуй гілки для нових фіч

```bash
git checkout -b feature/назва-фічі
# ... робота ...
git push origin feature/назва-фічі
```

Так `main` завжди залишається стабільним.

---

## 🚑 Якщо вже зробив `reset --hard` випадково — `git reflog` рятує

```bash
git reflog
# знайти потрібний рядок, скопіювати SHA
git checkout -b recovery <SHA>
git push origin recovery
```

`reflog` зберігає **всю** локальну історію навіть після `reset --hard`.

---

## 🤖 Автоматичний backup (налаштовано)

Workflow `.github/workflows/auto-backup.yml` автоматично створює тег виду `backup/YYYYMMDD-HHMMSS` при кожному push до `main`.

Переглянути всі backup-теги:
```bash
git tag -l "backup/*"
# або на GitHub: вкладка Tags
```

Відновити з backup-тегу:
```bash
git checkout -b recovery backup/20260411-192000
```
