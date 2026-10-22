function installLanguage() {
  function integer(name, value) {
    attachWin32(name, { onLeave(result) { const old = result.toUInt32(); result.replace(value); record(name, old, value); } });
  }
  if (CONFIG.language.enabled) {
    for (const [name, locale] of [['GetUserDefaultUILanguage', CONFIG.language.userUI], ['GetSystemDefaultUILanguage', CONFIG.language.systemUI], ['GetThreadUILanguage', CONFIG.language.userUI]]) integer(name, LANGIDS[locale]);
    for (const [name, locale] of [['GetUserPreferredUILanguages', CONFIG.language.userUI], ['GetSystemPreferredUILanguages', CONFIG.language.systemUI], ['GetThreadPreferredUILanguages', CONFIG.language.userUI], ['GetProcessPreferredUILanguages', CONFIG.language.userUI]]) {
      attachWin32(name, {
        onEnter(args) {
          this.flags = args[0].toUInt32(); this.count = args[1]; this.buffer = args[2]; this.size = args[3];
          this.capacity = this.size.isNull() ? 0 : this.size.readU32();
        },
        onLeave(result) {
          // Preserve native invalid-flag/pointer failures; only correct size errors.
          if (this.count.isNull() || this.size.isNull() || (this.flags & 12) === 12) return;
          if (result.toInt32() === 0 && this.lastError !== 122) return;
          const value = (this.flags & 4) ? LANGIDS[locale].toString(16).padStart(4, '0') : locale;
          const needed = value.length + 2;
          const old = result.toInt32() && !this.buffer.isNull() ? this.buffer.readUtf16String() : null;
          this.count.writeU32(1); this.size.writeU32(needed);
          if (this.buffer.isNull() && this.capacity === 0) result.replace(1);
          else if (this.buffer.isNull() || this.capacity < needed) { result.replace(0); this.lastError = 122; }
          else { this.buffer.writeUtf16String(value); this.buffer.add((value.length + 1) * 2).writeU16(0); result.replace(1); }
          record(name, old, value, result.toInt32());
        }
      });
    }
  }
  if (CONFIG.locale.enabled) {
    for (const [name, locale] of [['GetUserDefaultLangID', CONFIG.locale.user], ['GetSystemDefaultLangID', CONFIG.locale.system], ['GetUserDefaultLCID', CONFIG.locale.user], ['GetSystemDefaultLCID', CONFIG.locale.system], ['GetThreadLocale', CONFIG.locale.user]]) integer(name, LANGIDS[locale]);
    for (const [name, locale] of [['GetUserDefaultLocaleName', CONFIG.locale.user], ['GetSystemDefaultLocaleName', CONFIG.locale.system]]) {
      const location = address('kernel32.dll', name);
      // onLeave preserves native LastError semantics via the invocation context.
      retained.push(Interceptor.attach(location, {
        onEnter(args) { this.buffer = args[0]; this.capacity = args[1].toInt32(); },
        onLeave(result) {
          const old = result.toInt32() > 0 && !this.buffer.isNull() ? this.buffer.readUtf16String() : null;
          if (this.buffer.isNull() || this.capacity <= 0) { result.replace(0); this.lastError = 87; }
          else if (this.capacity < locale.length + 1) { result.replace(0); this.lastError = 122; }
          else { this.buffer.writeUtf16String(locale); result.replace(locale.length + 1); }
          record(name, old, locale, result.toInt32());
        }
      }));
      installed.push(name);
    }
  }
  if (!CONFIG.locale.enabled) return;
  const user = Memory.allocUtf16String(CONFIG.locale.user), system = Memory.allocUtf16String(CONFIG.locale.system);
  retained.push(user, system);
  for (const name of ['GetLocaleInfoEx','GetDateFormatEx','GetTimeFormatEx','GetNumberFormatEx','GetCurrencyFormatEx']) {
    attachWin32(name, {
      onEnter(args) {
        const original = args[0].isNull() ? null : args[0].readUtf16String().toLowerCase();
        this.value = original === null ? CONFIG.locale.user : ['!x-sys-default-locale','!sys-default-locale'].includes(original) ? CONFIG.locale.system : null;
        this.original = original;
        if (this.value) args[0] = original === null ? user : system;
      },
      onLeave(result) { if (this.value) record(name, this.original, this.value, result.toInt32()); }
    });
  }
  for (const name of ['GetLocaleInfoW','GetLocaleInfoA','GetDateFormatW','GetDateFormatA','GetTimeFormatW','GetTimeFormatA','GetNumberFormatW','GetNumberFormatA','GetCurrencyFormatW','GetCurrencyFormatA']) {
    attachWin32(name, {
      onEnter(args) {
        this.original = args[0].toUInt32();
        this.value = this.original === 0x400 ? LANGIDS[CONFIG.locale.user] : this.original === 0x800 ? LANGIDS[CONFIG.locale.system] : null;
        if (this.value !== null) args[0] = ptr(this.value);
      },
      onLeave(result) { if (this.value !== null) record(name, this.original, this.value, result.toInt32()); }
    });
  }
}
