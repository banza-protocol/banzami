import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Brand colors
// ---------------------------------------------------------------------------

abstract class BanzamiColors {
  // Primary — Sailor Blue
  static const Color navy      = Color(0xFF00203F); // primary identity
  static const Color navyDark  = Color(0xFF001428); // gradient deep / pressed
  static const Color navyMid   = Color(0xFF003A6B); // mid tone for gradients

  // Backward-compatibility aliases (all existing screens use these names)
  static const Color wine      = navy;
  static const Color wineDark  = navyDark;
  static const Color wineLight = navyMid;

  // Accent — Mint
  static const Color mint      = Color(0xFFADEFD1); // accent / highlight
  static const Color mintDark  = Color(0xFF7EC8A8); // pressed / deeper mint
  static const Color mintLight = Color(0xFFD6F7EC); // subtle mint fill
  static const Color mintBg    = Color(0xFFEEFAF5); // very light mint surface

  // Neutrals — cool-tinted to pair with navy
  static const Color white    = Color(0xFFFFFFFF);
  static const Color offWhite = Color(0xFFF7F9FB); // cool near-white — main background
  static const Color gray100  = Color(0xFFEEF1F5); // form fills, chips
  static const Color gray200  = Color(0xFFDDE3EC); // borders, dividers
  static const Color gray400  = Color(0xFF6B7A8D); // secondary text
  static const Color gray600  = Color(0xFF3D4F63); // tertiary text
  static const Color gray700  = Color(0xFF3D4F63); // alias → gray600
  static const Color gray900  = Color(0xFF0A1628); // primary text (navy-tinted black)

  // Semantic
  static const Color success   = Color(0xFF0D7A52);
  static const Color successBg = Color(0xFFEEFAF5);
  static const Color warning   = Color(0xFF92600E);
  static const Color warningBg = Color(0xFFFFFBEB);
  static const Color error     = Color(0xFFC0392B);
  static const Color errorBg   = Color(0xFFFEF2F2);
  static const Color info      = Color(0xFF00203F);
  static const Color infoBg    = Color(0xFFEEF4FF);

  BanzamiColors._();
}

// ---------------------------------------------------------------------------
// Gradients
// ---------------------------------------------------------------------------

abstract class BanzamiGradients {
  /// Primary navy gradient — balance card, key headers.
  static const LinearGradient navy = LinearGradient(
    colors: [Color(0xFF00203F), Color(0xFF001428)],
    begin:  Alignment.topLeft,
    end:    Alignment.bottomRight,
  );

  /// Navy to mid blue — secondary surfaces.
  static const LinearGradient navyBlue = LinearGradient(
    colors: [Color(0xFF00203F), Color(0xFF003A6B)],
    begin:  Alignment.topLeft,
    end:    Alignment.bottomRight,
  );

  /// Mint accent — premium badge, highlight strip.
  static const LinearGradient mint = LinearGradient(
    colors: [Color(0xFFADEFD1), Color(0xFF7EC8A8)],
    begin:  Alignment.topLeft,
    end:    Alignment.bottomRight,
  );

  // Keep wine as alias during transition (unused but prevents SDK breakage).
  static const LinearGradient wine = navy;

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
      seedColor:   BanzamiColors.navy,
      primary:     BanzamiColors.navy,
      onPrimary:   BanzamiColors.white,
      secondary:   BanzamiColors.mint,
      onSecondary: BanzamiColors.navy,
      tertiary:    BanzamiColors.mintDark,
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
          backgroundColor: BanzamiColors.navy,
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
          foregroundColor: BanzamiColors.navy,
          minimumSize:     const Size(double.infinity, 50),
          shape: const RoundedRectangleBorder(
            borderRadius: BanzamiRadius.lgAll,
          ),
          side: const BorderSide(color: BanzamiColors.navy, width: 1.5),
          textStyle: BanzamiTextStyles.label.copyWith(
            fontSize:   15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: BanzamiColors.navy,
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
          borderSide:   BorderSide(color: BanzamiColors.navy, width: 1.5),
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
          color:      BanzamiColors.navy,
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
        color: BanzamiColors.navy,
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
        indicatorColor:  BanzamiColors.navy,
        surfaceTintColor: Colors.transparent,
        elevation:  0,
        shadowColor: const Color(0x1A000000),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return BanzamiTextStyles.label.copyWith(
            fontSize: 11,
            color: selected ? BanzamiColors.navy : BanzamiColors.gray400,
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
