import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Brand colors
// ---------------------------------------------------------------------------

abstract class BanzamiColors {
  // Primary — Space Cherry
  static const Color wine      = Color(0xFFB30012); // primary identity
  static const Color wineDark  = Color(0xFF4A0005); // gradient deep / pressed
  static const Color wineLight = Color(0xFF8E000D); // gradient end / hover

  // Secondary — Wine Rose
  static const Color wineRose  = Color(0xFFA63A50); // secondary — badges, tags, accents

  // Accent — Savanna Gold
  static const Color gold      = Color(0xFFC89B3C); // accent — highlights, positive emphasis
  static const Color goldLight = Color(0xFFD4AF5C); // gold hover / light variant

  // Brand Black
  static const Color black    = Color(0xFF1A1A1A); // brand black — high-contrast surfaces, dark mode base

  // Neutrals — warm-tinted to pair with cherry
  static const Color white    = Color(0xFFFFFFFF);
  static const Color offWhite = Color(0xFFF5F3F1); // Warm White — main background
  static const Color gray100  = Color(0xFFF5EEED); // form fills, chips
  static const Color gray200  = Color(0xFFE7E2DE); // borders, dividers
  static const Color gray400  = Color(0xFF9C8483); // secondary text
  static const Color gray600  = Color(0xFF534040); // tertiary text
  static const Color gray700  = Color(0xFF534040); // alias → gray600
  static const Color gray900  = black;              // primary text

  // Semantic
  static const Color success   = Color(0xFF166534);
  static const Color successBg = Color(0xFFF0FDF4);
  static const Color warning   = Color(0xFF92400E);
  static const Color warningBg = Color(0xFFFFFBEB);
  static const Color error     = Color(0xFFDC2626); // clearly distinct from cherry
  static const Color errorBg   = Color(0xFFFEF2F2);
  static const Color info      = Color(0xFF1E3A8A);
  static const Color infoBg    = Color(0xFFEFF6FF);

  BanzamiColors._();
}

// ---------------------------------------------------------------------------
// Gradients
// ---------------------------------------------------------------------------

abstract class BanzamiGradients {
  /// Primary cherry gradient — balance card, key headers.
  static const LinearGradient wine = LinearGradient(
    colors: [Color(0xFFB30012), Color(0xFF4A0005)],
    begin:  Alignment.topLeft,
    end:    Alignment.bottomRight,
  );

  /// Cherry to lighter — secondary surfaces.
  static const LinearGradient wineLight = LinearGradient(
    colors: [Color(0xFFB30012), Color(0xFF8E000D)],
    begin:  Alignment.topLeft,
    end:    Alignment.bottomRight,
  );

  BanzamiGradients._();
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

abstract class BanzamiTextStyles {
  static const String _fontFamily = 'Inter';

  static const TextStyle displayXl = TextStyle(
    fontFamily:    _fontFamily,
    fontSize:      48,
    fontWeight:    FontWeight.w700,
    height:        56 / 48,
    letterSpacing: -0.5,
    color:         BanzamiColors.gray900,
  );

  static const TextStyle displayLg = TextStyle(
    fontFamily:    _fontFamily,
    fontSize:      36,
    fontWeight:    FontWeight.w700,
    height:        44 / 36,
    letterSpacing: -0.3,
    color:         BanzamiColors.gray900,
  );

  static const TextStyle displayMd = TextStyle(
    fontFamily:    _fontFamily,
    fontSize:      28,
    fontWeight:    FontWeight.w600,
    height:        36 / 28,
    letterSpacing: -0.2,
    color:         BanzamiColors.gray900,
  );

  static const TextStyle headingLg = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   22,
    fontWeight: FontWeight.w600,
    height:     30 / 22,
    color:      BanzamiColors.gray900,
  );

  static const TextStyle headingMd = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   18,
    fontWeight: FontWeight.w600,
    height:     26 / 18,
    color:      BanzamiColors.gray900,
  );

  static const TextStyle headingSm = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   16,
    fontWeight: FontWeight.w600,
    height:     24 / 16,
    color:      BanzamiColors.gray900,
  );

  static const TextStyle bodyLg = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   16,
    fontWeight: FontWeight.w400,
    height:     24 / 16,
    color:      BanzamiColors.gray900,
  );

  static const TextStyle bodyMd = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   14,
    fontWeight: FontWeight.w400,
    height:     20 / 14,
    color:      BanzamiColors.gray900,
  );

  static const TextStyle bodySm = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   12,
    fontWeight: FontWeight.w400,
    height:     18 / 12,
    color:      BanzamiColors.gray400,
  );

  static const TextStyle label = TextStyle(
    fontFamily:    _fontFamily,
    fontSize:      12,
    fontWeight:    FontWeight.w500,
    height:        16 / 12,
    letterSpacing: 0.2,
    color:         BanzamiColors.gray900,
  );

  static const TextStyle mono = TextStyle(
    fontFamily:   'JetBrains Mono',
    fontSize:     14,
    fontWeight:   FontWeight.w400,
    height:       20 / 14,
    fontFeatures: [FontFeature.tabularFigures()],
    color:        BanzamiColors.gray900,
  );

  static const TextStyle monoLg = TextStyle(
    fontFamily:   'JetBrains Mono',
    fontSize:     28,
    fontWeight:   FontWeight.w600,
    height:       36 / 28,
    fontFeatures: [FontFeature.tabularFigures()],
    color:        BanzamiColors.gray900,
  );

  BanzamiTextStyles._();
}

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

abstract class BanzamiSpacing {
  static const double micro   = 2;
  static const double xs      = 4;
  static const double sm      = 8;
  static const double md      = 12;
  static const double lg      = 16;
  static const double xl      = 24;
  static const double xxl     = 32;
  static const double section = 48;
  static const double page    = 64;

  BanzamiSpacing._();
}

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

abstract class BanzamiRadius {
  static const double sm   = 4;
  static const double md   = 8;
  static const double lg   = 12;
  static const double xl   = 16;
  static const double xxl  = 24;
  static const double full = 999;

  static const BorderRadius smAll   = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll   = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll   = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius xlAll   = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius xxlAll  = BorderRadius.all(Radius.circular(xxl));
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
      color:      Color(0x0A000000),
      blurRadius: 8,
      offset:     Offset(0, 2),
    ),
    BoxShadow(
      color:      Color(0x06000000),
      blurRadius: 1,
      offset:     Offset(0, 0),
    ),
  ];

  static const List<BoxShadow> cardElevated = [
    BoxShadow(
      color:      Color(0x14000000),
      blurRadius: 16,
      offset:     Offset(0, 4),
    ),
    BoxShadow(
      color:      Color(0x08000000),
      blurRadius: 4,
      offset:     Offset(0, 1),
    ),
  ];

  static const List<BoxShadow> modal = [
    BoxShadow(
      color:      Color(0x1F000000),
      blurRadius: 24,
      offset:     Offset(0, 8),
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
      seedColor:   BanzamiColors.wine,
      primary:     BanzamiColors.wine,
      onPrimary:   BanzamiColors.white,
      secondary:   BanzamiColors.wineLight,
      onSecondary: BanzamiColors.white,
      tertiary:    BanzamiColors.wineDark,
      onTertiary:  BanzamiColors.white,
      surface:     BanzamiColors.white,
      onSurface:   BanzamiColors.gray900,
      error:       BanzamiColors.error,
      onError:     BanzamiColors.white,
      brightness:  Brightness.light,
    );

    return ThemeData(
      useMaterial3:            true,
      colorScheme:             colorScheme,
      scaffoldBackgroundColor: BanzamiColors.offWhite,
      fontFamily:              'Inter',

      appBarTheme: const AppBarTheme(
        backgroundColor:        BanzamiColors.white,
        foregroundColor:        BanzamiColors.gray900,
        elevation:              0,
        scrolledUnderElevation: 0.5,
        centerTitle:            false,
        titleTextStyle:         BanzamiTextStyles.headingMd,
        surfaceTintColor:       Colors.transparent,
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BanzamiColors.wine,
          foregroundColor: BanzamiColors.white,
          minimumSize:     const Size(double.infinity, 50),
          shape: const RoundedRectangleBorder(
            borderRadius: BanzamiRadius.lgAll,
          ),
          textStyle: BanzamiTextStyles.label.copyWith(
            fontSize:   15,
            fontWeight: FontWeight.w600,
          ),
          elevation: 0,
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BanzamiColors.wine,
          minimumSize:     const Size(double.infinity, 50),
          shape: const RoundedRectangleBorder(
            borderRadius: BanzamiRadius.lgAll,
          ),
          side: const BorderSide(color: BanzamiColors.wine, width: 1.5),
          textStyle: BanzamiTextStyles.label.copyWith(
            fontSize:   15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: BanzamiColors.wine,
          textStyle: BanzamiTextStyles.label.copyWith(
            fontSize:   14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled:     true,
        fillColor:  BanzamiColors.gray100,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg,
          vertical:   BanzamiSpacing.md,
        ),
        border: const OutlineInputBorder(
          borderRadius: BanzamiRadius.lgAll,
          borderSide:   BorderSide.none,
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.lgAll,
          borderSide:   BorderSide.none,
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.lgAll,
          borderSide:   BorderSide(color: BanzamiColors.wine, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.lgAll,
          borderSide:   BorderSide(color: BanzamiColors.error, width: 1.5),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.lgAll,
          borderSide:   BorderSide(color: BanzamiColors.error, width: 1.5),
        ),
        hintStyle:  BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
        labelStyle: BanzamiTextStyles.label.copyWith(color: BanzamiColors.gray600),
        errorStyle: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error),
        floatingLabelStyle: const TextStyle(
          color:      BanzamiColors.wine,
          fontSize:   12,
          fontWeight: FontWeight.w500,
        ),
      ),

      cardTheme: const CardThemeData(
        color:     BanzamiColors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BanzamiRadius.lgAll,
          side: BorderSide(color: BanzamiColors.gray200, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),

      dividerTheme: const DividerThemeData(
        color:     BanzamiColors.gray100,
        thickness: 1,
        space:     0,
      ),

      chipTheme: ChipThemeData(
        backgroundColor: BanzamiColors.gray100,
        labelStyle:      BanzamiTextStyles.label.copyWith(color: BanzamiColors.gray600),
        side:            BorderSide.none,
        shape: const RoundedRectangleBorder(borderRadius: BanzamiRadius.smAll),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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
          borderRadius: BanzamiRadius.lgAll,
        ),
        behavior:  SnackBarBehavior.floating,
        elevation: 4,
      ),

      listTileTheme: const ListTileThemeData(
        tileColor:      BanzamiColors.white,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        minLeadingWidth: 20,
        iconColor:      BanzamiColors.gray600,
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: BanzamiColors.white,
        indicatorColor:  BanzamiColors.wine,
        surfaceTintColor: Colors.transparent,
        elevation:  0,
        shadowColor: const Color(0x1A000000),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return BanzamiTextStyles.label.copyWith(
            fontSize: 11,
            color: selected ? BanzamiColors.wine : BanzamiColors.gray400,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? BanzamiColors.white : BanzamiColors.gray400,
            size:  22,
          );
        }),
      ),
    );
  }

  BanzamiTheme._();
}
