import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Brand colors
// ---------------------------------------------------------------------------

abstract class BanzamiColors {
  // Primary wine palette
  static const Color wine = Color(0xFF6D071A);
  static const Color wineDark = Color(0xFF4B0911);
  static const Color wineMedium = Color(0xFF8E1026);

  // Accent copper
  static const Color copper = Color(0xFFC56A2D);
  static const Color copperLight = Color(0xFFD4834A);

  // Neutrals
  static const Color white = Color(0xFFFFFFFF);
  static const Color offWhite = Color(0xFFF6F4F1);
  static const Color gray100 = Color(0xFFF0EDEA);
  static const Color gray400 = Color(0xFF9E9A96);
  static const Color gray700 = Color(0xFF4A4744);
  static const Color gray900 = Color(0xFF1A1816);

  // Semantic
  static const Color success   = Color(0xFF1A7A4A);
  static const Color successBg = Color(0xFFECFDF5);
  static const Color warning   = Color(0xFFB45309);
  static const Color warningBg = Color(0xFFFFFBEB);
  static const Color error     = Color(0xFFB91C1C);
  static const Color errorBg   = Color(0xFFFEF2F2);
  static const Color info      = Color(0xFF1E40AF);
  static const Color infoBg    = Color(0xFFEFF6FF);

  BanzamiColors._();
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

abstract class BanzamiTextStyles {
  static const String _fontFamily = 'Inter';

  static const TextStyle displayXl = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 48,
    fontWeight: FontWeight.w700,
    height: 56 / 48,
    color: BanzamiColors.gray900,
  );

  static const TextStyle displayLg = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 36,
    fontWeight: FontWeight.w700,
    height: 44 / 36,
    color: BanzamiColors.gray900,
  );

  static const TextStyle displayMd = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 28,
    fontWeight: FontWeight.w600,
    height: 36 / 28,
    color: BanzamiColors.gray900,
  );

  static const TextStyle headingLg = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 22,
    fontWeight: FontWeight.w600,
    height: 30 / 22,
    color: BanzamiColors.gray900,
  );

  static const TextStyle headingMd = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 18,
    fontWeight: FontWeight.w600,
    height: 26 / 18,
    color: BanzamiColors.gray900,
  );

  static const TextStyle headingSm = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 16,
    fontWeight: FontWeight.w600,
    height: 24 / 16,
    color: BanzamiColors.gray900,
  );

  static const TextStyle bodyLg = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 24 / 16,
    color: BanzamiColors.gray900,
  );

  static const TextStyle bodyMd = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 20 / 14,
    color: BanzamiColors.gray900,
  );

  static const TextStyle bodySm = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 18 / 12,
    color: BanzamiColors.gray700,
  );

  static const TextStyle label = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w500,
    height: 16 / 12,
    letterSpacing: 0.3,
    color: BanzamiColors.gray900,
  );

  /// Monetary amounts — tabular numerals for decimal alignment.
  static const TextStyle mono = TextStyle(
    fontFamily: 'JetBrains Mono',
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 20 / 14,
    fontFeatures: [FontFeature.tabularFigures()],
    color: BanzamiColors.gray900,
  );

  static const TextStyle monoLg = TextStyle(
    fontFamily: 'JetBrains Mono',
    fontSize: 28,
    fontWeight: FontWeight.w600,
    height: 36 / 28,
    fontFeatures: [FontFeature.tabularFigures()],
    color: BanzamiColors.gray900,
  );

  BanzamiTextStyles._();
}

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

abstract class BanzamiSpacing {
  static const double micro = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double section = 48;
  static const double page = 64;

  BanzamiSpacing._();
}

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

abstract class BanzamiRadius {
  static const double sm = 4;
  static const double md = 8;
  static const double lg = 12;
  static const double xl = 16;
  static const double full = 999;

  static const BorderRadius smAll   = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll   = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll   = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius xlAll   = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius fullAll = BorderRadius.all(Radius.circular(full));

  BanzamiRadius._();
}

// ---------------------------------------------------------------------------
// Elevation / shadow
// ---------------------------------------------------------------------------

abstract class BanzamiShadows {
  static const List<BoxShadow> none = [];

  static const List<BoxShadow> card = [
    BoxShadow(
      color: Color(0x14000000),
      blurRadius: 8,
      offset: Offset(0, 2),
    ),
  ];

  static const List<BoxShadow> modal = [
    BoxShadow(
      color: Color(0x1F000000),
      blurRadius: 16,
      offset: Offset(0, 4),
    ),
  ];

  BanzamiShadows._();
}

// ---------------------------------------------------------------------------
// ThemeData
// ---------------------------------------------------------------------------

abstract class BanzamiTheme {
  static ThemeData get light {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: BanzamiColors.wine,
      primary: BanzamiColors.wine,
      onPrimary: BanzamiColors.white,
      secondary: BanzamiColors.copper,
      onSecondary: BanzamiColors.white,
      surface: BanzamiColors.white,
      onSurface: BanzamiColors.gray900,
      error: BanzamiColors.error,
      onError: BanzamiColors.white,
      brightness: Brightness.light,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: BanzamiColors.offWhite,
      fontFamily: 'Inter',

      appBarTheme: const AppBarTheme(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        titleTextStyle: BanzamiTextStyles.headingMd,
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BanzamiColors.wine,
          foregroundColor: BanzamiColors.white,
          minimumSize: const Size(double.infinity, 48),
          shape: const RoundedRectangleBorder(
            borderRadius: BanzamiRadius.mdAll,
          ),
          textStyle: BanzamiTextStyles.label.copyWith(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
          elevation: 0,
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BanzamiColors.wine,
          minimumSize: const Size(double.infinity, 48),
          shape: const RoundedRectangleBorder(
            borderRadius: BanzamiRadius.mdAll,
          ),
          side: const BorderSide(color: BanzamiColors.wine, width: 1.5),
          textStyle: BanzamiTextStyles.label.copyWith(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: BanzamiColors.wine,
          textStyle: BanzamiTextStyles.label.copyWith(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BanzamiColors.gray100,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg,
          vertical: BanzamiSpacing.md,
        ),
        border: const OutlineInputBorder(
          borderRadius: BanzamiRadius.mdAll,
          borderSide: BorderSide.none,
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.mdAll,
          borderSide: BorderSide.none,
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.mdAll,
          borderSide: BorderSide(color: BanzamiColors.wine, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.mdAll,
          borderSide: BorderSide(color: BanzamiColors.error, width: 1.5),
        ),
        hintStyle: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
        labelStyle: BanzamiTextStyles.label,
        errorStyle: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error),
      ),

      cardTheme: const CardThemeData(
        color: BanzamiColors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BanzamiRadius.lgAll,
          side: BorderSide(color: BanzamiColors.gray100, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),

      dividerTheme: const DividerThemeData(
        color: BanzamiColors.gray100,
        thickness: 1,
        space: 0,
      ),

      chipTheme: const ChipThemeData(
        backgroundColor: BanzamiColors.gray100,
        labelStyle: BanzamiTextStyles.label,
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BanzamiRadius.smAll),
      ),

      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: BanzamiColors.wine,
      ),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: BanzamiColors.gray900,
        contentTextStyle: BanzamiTextStyles.bodyMd.copyWith(
          color: BanzamiColors.white,
        ),
        shape: const RoundedRectangleBorder(
          borderRadius: BanzamiRadius.mdAll,
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  BanzamiTheme._();
}
