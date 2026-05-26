import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Brand colors
// ---------------------------------------------------------------------------

abstract class BanzaColors {
  // Primary — Space Cherry (official Banza brand palette)
  static const Color wine        = Color(0xFF990011); // Primary Space Cherry — brand identity
  static const Color wineLight   = Color(0xFFC21A2C); // Cherry Highlight — hover, QR centres, secondary fills
  static const Color wineDark    = Color(0xFF5E000A); // Deep Shadow — gradient terminus, pressed state
  static const Color wineMid     = Color(0xFF7A000D); // Mid gradient stop

  // Secondary — Wine Rose
  static const Color wineRose    = Color(0xFFA63A50); // secondary — badges, tags, accents

  // Accent — Savanna Gold
  static const Color gold        = Color(0xFFC89B3C); // accent — highlights, positive emphasis
  static const Color goldLight   = Color(0xFFD4AF5C); // gold hover / light variant

  // Brand Black
  static const Color black       = Color(0xFF1A1A1A); // Near Black — primary text, dark surfaces

  // Neutrals — warm-tinted to pair with cherry
  static const Color white       = Color(0xFFFFFFFF);
  static const Color offWhite    = Color(0xFFFCF6F5); // Soft White — main background
  static const Color softNeutral = Color(0xFFD8D0CF); // Soft Neutral Shadow — surface gradient end
  static const Color gray100     = Color(0xFFF5EEED); // form fills, chips
  static const Color gray200     = Color(0xFFE7E2DE); // borders, dividers
  static const Color gray400     = Color(0xFF9C8483); // secondary text
  static const Color gray600     = Color(0xFF534040); // tertiary text
  static const Color gray700     = Color(0xFF534040); // alias → gray600
  static const Color gray900     = black;              // primary text

  // Semantic
  static const Color success   = Color(0xFF166534);
  static const Color successBg = Color(0xFFF0FDF4);
  static const Color warning   = Color(0xFF92400E);
  static const Color warningBg = Color(0xFFFFFBEB);
  static const Color error     = Color(0xFFDC2626); // clearly distinct from cherry
  static const Color errorBg   = Color(0xFFFEF2F2);
  static const Color info      = Color(0xFF1E3A8A);
  static const Color infoBg    = Color(0xFFEFF6FF);

  BanzaColors._();
}

// ---------------------------------------------------------------------------
// Gradients
// ---------------------------------------------------------------------------

abstract class BanzaGradients {
  /// Primary Banza gradient — balance card, key headers, confirm screen avatar.
  /// 4-stop deep wine at ~145°. Start darkened from #C21A2C → #920E1B for
  /// a calmer, more premium look — reduces left-side saturation jump.
  static const LinearGradient wine = LinearGradient(
    begin:  Alignment(-0.57, -0.82),
    end:    Alignment(0.57, 0.82),
    colors: [
      Color(0xFF920E1B), // Dark Wine-Cherry — 0%  (was #C21A2C, too bright)
      Color(0xFF7A000D), // Mid — 45%
      Color(0xFF660009), // Near Dark — 75%
      Color(0xFF5E000A), // Deep Shadow — 100%
    ],
    stops: [0.0, 0.45, 0.75, 1.0],
  );

  /// Light surface gradient — page backgrounds, card fills.
  static const LinearGradient surface = LinearGradient(
    begin:  Alignment.topCenter,
    end:    Alignment.bottomCenter,
    colors: [
      Color(0xFFFFFFFF), // Pure white — 0%
      Color(0xFFFCF6F5), // Soft White — 55%
      Color(0xFFD8D0CF), // Soft Neutral Shadow — 100%
    ],
    stops: [0.0, 0.55, 1.0],
  );

  /// Cherry highlight gradient — secondary CTAs, outlined fills.
  static const LinearGradient wineLight = LinearGradient(
    begin:  Alignment.topLeft,
    end:    Alignment.bottomRight,
    colors: [
      Color(0xFFC21A2C), // Cherry Highlight
      Color(0xFF990011), // Primary Space Cherry
    ],
  );

  BanzaGradients._();
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

abstract class BanzaTextStyles {
  static const String _fontFamily = 'Inter';

  static const TextStyle displayXl = TextStyle(
    fontFamily:    _fontFamily,
    fontSize:      48,
    fontWeight:    FontWeight.w700,
    height:        56 / 48,
    letterSpacing: -0.5,
    color:         BanzaColors.gray900,
  );

  static const TextStyle displayLg = TextStyle(
    fontFamily:    _fontFamily,
    fontSize:      36,
    fontWeight:    FontWeight.w700,
    height:        44 / 36,
    letterSpacing: -0.3,
    color:         BanzaColors.gray900,
  );

  static const TextStyle displayMd = TextStyle(
    fontFamily:    _fontFamily,
    fontSize:      28,
    fontWeight:    FontWeight.w600,
    height:        36 / 28,
    letterSpacing: -0.2,
    color:         BanzaColors.gray900,
  );

  static const TextStyle headingLg = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   22,
    fontWeight: FontWeight.w600,
    height:     30 / 22,
    color:      BanzaColors.gray900,
  );

  static const TextStyle headingMd = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   18,
    fontWeight: FontWeight.w600,
    height:     26 / 18,
    color:      BanzaColors.gray900,
  );

  static const TextStyle headingSm = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   16,
    fontWeight: FontWeight.w600,
    height:     24 / 16,
    color:      BanzaColors.gray900,
  );

  static const TextStyle bodyLg = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   16,
    fontWeight: FontWeight.w400,
    height:     24 / 16,
    color:      BanzaColors.gray900,
  );

  static const TextStyle bodyMd = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   14,
    fontWeight: FontWeight.w400,
    height:     20 / 14,
    color:      BanzaColors.gray900,
  );

  static const TextStyle bodySm = TextStyle(
    fontFamily: _fontFamily,
    fontSize:   12,
    fontWeight: FontWeight.w400,
    height:     18 / 12,
    color:      BanzaColors.gray400,
  );

  static const TextStyle label = TextStyle(
    fontFamily:    _fontFamily,
    fontSize:      12,
    fontWeight:    FontWeight.w500,
    height:        16 / 12,
    letterSpacing: 0.2,
    color:         BanzaColors.gray900,
  );

  static const TextStyle mono = TextStyle(
    fontFamily:   'JetBrains Mono',
    fontSize:     14,
    fontWeight:   FontWeight.w400,
    height:       20 / 14,
    fontFeatures: [FontFeature.tabularFigures()],
    color:        BanzaColors.gray900,
  );

  static const TextStyle monoLg = TextStyle(
    fontFamily:   'JetBrains Mono',
    fontSize:     28,
    fontWeight:   FontWeight.w600,
    height:       36 / 28,
    fontFeatures: [FontFeature.tabularFigures()],
    color:        BanzaColors.gray900,
  );

  BanzaTextStyles._();
}

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

abstract class BanzaSpacing {
  static const double micro   = 2;
  static const double xs      = 4;
  static const double sm      = 8;
  static const double md      = 12;
  static const double lg      = 16;
  static const double xl      = 24;
  static const double xxl     = 32;
  static const double section = 48;
  static const double page    = 64;

  BanzaSpacing._();
}

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

abstract class BanzaRadius {
  static const double sm    = 4;
  static const double md    = 8;
  static const double lg    = 12;
  static const double xl    = 16;
  static const double field = 20;  // inputs, auth CTAs
  static const double xxl   = 24;
  static const double full  = 999;

  static const BorderRadius smAll    = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll    = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll    = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius xlAll    = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius fieldAll = BorderRadius.all(Radius.circular(field));
  static const BorderRadius xxlAll   = BorderRadius.all(Radius.circular(xxl));
  static const BorderRadius fullAll  = BorderRadius.all(Radius.circular(full));

  BanzaRadius._();
}

// ---------------------------------------------------------------------------
// Elevation / shadow
// ---------------------------------------------------------------------------

abstract class BanzaShadows {
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

  BanzaShadows._();
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

abstract class BanzaMotion {
  // Durations
  static const Duration instant  = Duration(milliseconds: 100);
  static const Duration fast     = Duration(milliseconds: 150);
  static const Duration normal   = Duration(milliseconds: 250);
  static const Duration slow     = Duration(milliseconds: 380);
  static const Duration enter    = Duration(milliseconds: 300);
  static const Duration exit     = Duration(milliseconds: 220);

  // Curves
  static const Curve standard    = Curves.easeInOut;
  static const Curve decelerate  = Curves.easeOut;
  static const Curve accelerate  = Curves.easeIn;
  static const Curve spring      = Curves.elasticOut;
  static const Curve emphasize   = Cubic(0.2, 0, 0, 1.0);

  BanzaMotion._();
}

// ---------------------------------------------------------------------------
// ThemeData
// ---------------------------------------------------------------------------

abstract class BanzaTheme {
  static ThemeData get light {
    final colorScheme = ColorScheme.fromSeed(
      seedColor:   BanzaColors.wine,
      primary:     BanzaColors.wine,
      onPrimary:   BanzaColors.white,
      secondary:   BanzaColors.wineLight,
      onSecondary: BanzaColors.white,
      tertiary:    BanzaColors.wineDark,
      onTertiary:  BanzaColors.white,
      surface:     BanzaColors.white,
      onSurface:   BanzaColors.gray900,
      error:       BanzaColors.error,
      onError:     BanzaColors.white,
      brightness:  Brightness.light,
    );

    return ThemeData(
      useMaterial3:            true,
      colorScheme:             colorScheme,
      scaffoldBackgroundColor: BanzaColors.offWhite,
      fontFamily:              'Inter',

      appBarTheme: const AppBarTheme(
        backgroundColor:        BanzaColors.white,
        foregroundColor:        BanzaColors.gray900,
        elevation:              0,
        scrolledUnderElevation: 0.5,
        centerTitle:            false,
        titleTextStyle:         BanzaTextStyles.headingMd,
        surfaceTintColor:       Colors.transparent,
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BanzaColors.wine,
          foregroundColor: BanzaColors.white,
          minimumSize:     const Size(double.infinity, 50),
          shape: const RoundedRectangleBorder(
            borderRadius: BanzaRadius.lgAll,
          ),
          textStyle: BanzaTextStyles.label.copyWith(
            fontSize:   15,
            fontWeight: FontWeight.w600,
          ),
          elevation: 0,
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BanzaColors.wine,
          minimumSize:     const Size(double.infinity, 50),
          shape: const RoundedRectangleBorder(
            borderRadius: BanzaRadius.lgAll,
          ),
          side: const BorderSide(color: BanzaColors.wine, width: 1.5),
          textStyle: BanzaTextStyles.label.copyWith(
            fontSize:   15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: BanzaColors.wine,
          textStyle: BanzaTextStyles.label.copyWith(
            fontSize:   14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled:     true,
        fillColor:  BanzaColors.gray100,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: BanzaSpacing.lg + 4,
          vertical:   BanzaSpacing.md + 6,
        ),
        border: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide.none,
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide.none,
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide(color: BanzaColors.wine, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide(color: BanzaColors.error, width: 1.5),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide(color: BanzaColors.error, width: 1.5),
        ),
        hintStyle:  BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
        labelStyle: BanzaTextStyles.label.copyWith(color: BanzaColors.gray600),
        errorStyle: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error),
        floatingLabelStyle: const TextStyle(
          color:      BanzaColors.wine,
          fontSize:   12,
          fontWeight: FontWeight.w500,
        ),
      ),

      cardTheme: const CardThemeData(
        color:     BanzaColors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BanzaRadius.lgAll,
          side: BorderSide(color: BanzaColors.gray200, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),

      dividerTheme: const DividerThemeData(
        color:     BanzaColors.gray100,
        thickness: 1,
        space:     0,
      ),

      chipTheme: ChipThemeData(
        backgroundColor: BanzaColors.gray100,
        labelStyle:      BanzaTextStyles.label.copyWith(color: BanzaColors.gray600),
        side:            BorderSide.none,
        shape: const RoundedRectangleBorder(borderRadius: BanzaRadius.smAll),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      ),

      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: BanzaColors.wine,
      ),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: BanzaColors.gray900,
        contentTextStyle: BanzaTextStyles.bodyMd.copyWith(
          color: BanzaColors.white,
        ),
        shape: const RoundedRectangleBorder(
          borderRadius: BanzaRadius.lgAll,
        ),
        behavior:  SnackBarBehavior.floating,
        elevation: 4,
      ),

      listTileTheme: const ListTileThemeData(
        tileColor:      BanzaColors.white,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        minLeadingWidth: 20,
        iconColor:      BanzaColors.gray600,
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: BanzaColors.white,
        indicatorColor:  BanzaColors.wine,
        surfaceTintColor: Colors.transparent,
        elevation:  0,
        shadowColor: const Color(0x1A000000),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return BanzaTextStyles.label.copyWith(
            fontSize: 11,
            color: selected ? BanzaColors.wine : BanzaColors.gray400,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? BanzaColors.white : BanzaColors.gray400,
            size:  22,
          );
        }),
      ),
    );
  }

  BanzaTheme._();
}
