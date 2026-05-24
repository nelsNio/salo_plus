package main

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"salo_plus/models"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var bogotaLoc = func() *time.Location {
	loc, _ := time.LoadLocation("America/Bogota")
	return loc
}()

func main() {
	dbPath := os.Getenv("SQLITE_PATH")
	if dbPath == "" {
		dbPath = "./dev.db"
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatal("Error abriendo DB:", err)
	}

	db.AutoMigrate(
		&models.Producto{}, &models.Venta{}, &models.Item{},
		&models.Counter{}, &models.Empaque{}, &models.ProductoEmpaque{},
		&models.Egreso{}, &models.CierreCaja{},
	)

	// ── Empaques genéricos ──────────────────────────────────────────────────
	empaques := []models.Empaque{
		{Tipo: "Blister",  FactorConversion: 10, Descripcion: "Blister x10 unidades"},
		{Tipo: "Caja",     FactorConversion: 30, Descripcion: "Caja x30 unidades"},
		{Tipo: "Frasco",   FactorConversion: 60, Descripcion: "Frasco x60 unidades"},
		{Tipo: "Blister",  FactorConversion: 14, Descripcion: "Blister x14 unidades"},
		{Tipo: "Caja",     FactorConversion: 100, Descripcion: "Caja x100 unidades"},
	}
	for i := range empaques {
		db.FirstOrCreate(&empaques[i], models.Empaque{Tipo: empaques[i].Tipo, FactorConversion: empaques[i].FactorConversion})
	}
	fmt.Printf("✓ %d empaques\n", len(empaques))

	// ── Productos ───────────────────────────────────────────────────────────
	hoy := time.Now().In(bogotaLoc)
	pad := func(n int) string { return fmt.Sprintf("%02d", n) }
	fecha := func(y, m, d int) string { return fmt.Sprintf("%04d-%s-%s", y, pad(m), pad(d)) }

	productos := []models.Producto{
		{Nombre: "Acetaminofén 500mg", Laboratorio: "Genfar",      Presentacion: "Tableta",     PrecioUnitario: 45,   Cantidad: 850, Lote: "GT2024A", RegistroInvima: "INVIMA2019M-0012", FechaIngreso: fecha(2024,1,10), FechaVenc: fecha(2026,6,30), CodigoBarras: "7702019010029"},
		{Nombre: "Ibuprofeno 400mg",   Laboratorio: "Lafrancol",   Presentacion: "Tableta",     PrecioUnitario: 68,   Cantidad: 420, Lote: "LF2024B", RegistroInvima: "INVIMA2020M-0045", FechaIngreso: fecha(2024,2,5),  FechaVenc: fecha(2026,4,15), CodigoBarras: "7700056002187"},
		{Nombre: "Loratadina 10mg",    Laboratorio: "MK",           Presentacion: "Tableta",     PrecioUnitario: 52,   Cantidad: 7,   Lote: "MK2024C", RegistroInvima: "INVIMA2018M-0078", FechaIngreso: fecha(2024,3,1),  FechaVenc: fecha(2025,12,31), CodigoBarras: "7704324000138"},
		{Nombre: "Omeprazol 20mg",     Laboratorio: "Genfar",      Presentacion: "Cápsula",     PrecioUnitario: 89,   Cantidad: 0,   Lote: "GT2024D", RegistroInvima: "INVIMA2019M-0091", FechaIngreso: fecha(2024,1,20), FechaVenc: fecha(2025,8,1),  CodigoBarras: "7702628010043"},
		{Nombre: "Metformina 850mg",   Laboratorio: "Lafrancol",   Presentacion: "Tableta",     PrecioUnitario: 72,   Cantidad: 310, Lote: "LF2024E", RegistroInvima: "INVIMA2021M-0023", FechaIngreso: fecha(2024,4,12), FechaVenc: fecha(2026,9,30), CodigoBarras: "7707019000051"},
		{Nombre: "Atorvastatina 20mg", Laboratorio: "MK",           Presentacion: "Tableta",     PrecioUnitario: 110,  Cantidad: 200, Lote: "MK2024F", RegistroInvima: "INVIMA2020M-0067", FechaIngreso: fecha(2024,5,8),  FechaVenc: fecha(2027,1,15), CodigoBarras: "7707019000068"},
		{Nombre: "Amoxicilina 500mg",  Laboratorio: "Genfar",      Presentacion: "Cápsula",     PrecioUnitario: 135,  Cantidad: 180, Lote: "GT2024G", RegistroInvima: "INVIMA2019M-0104", FechaIngreso: fecha(2024,3,25), FechaVenc: fecha(2026,3,1),  CodigoBarras: "7702628010067"},
		{Nombre: "Diclofenaco 50mg",   Laboratorio: "Lafrancol",   Presentacion: "Tableta",     PrecioUnitario: 38,   Cantidad: 9,   Lote: "LF2024H", RegistroInvima: "INVIMA2018M-0112", FechaIngreso: fecha(2024,6,1),  FechaVenc: fecha(2026,6,1),  CodigoBarras: "7700056002194"},
		{Nombre: "Ranitidina 150mg",   Laboratorio: "Coaspharma",  Presentacion: "Tableta",     PrecioUnitario: 29,   Cantidad: 540, Lote: "CP2024I", RegistroInvima: "INVIMA2017M-0089", FechaIngreso: fecha(2024,2,14), FechaVenc: fecha(2026,12,31), CodigoBarras: "7704324000145"},
		{Nombre: "Vitamina C 1000mg",  Laboratorio: "Bayer",       Presentacion: "Efervescente",PrecioUnitario: 3200, Cantidad: 45,  Lote: "BY2024J", RegistroInvima: "INVIMA2022M-0031", FechaIngreso: fecha(2024,7,10), FechaVenc: fecha(2027,6,30), CodigoBarras: "4901301285430"},
		{Nombre: "Azitromicina 500mg", Laboratorio: "Genfar",      Presentacion: "Tableta",     PrecioUnitario: 890,  Cantidad: 65,  Lote: "GT2024K", RegistroInvima: "INVIMA2020M-0145", FechaIngreso: fecha(2024,8,3),  FechaVenc: fecha(2026,8,1),  CodigoBarras: "7702019010036"},
		{Nombre: "Losartán 50mg",      Laboratorio: "MK",           Presentacion: "Tableta",     PrecioUnitario: 95,   Cantidad: 280, Lote: "MK2024L", RegistroInvima: "INVIMA2019M-0178", FechaIngreso: fecha(2024,4,20), FechaVenc: fecha(2027,4,1),  CodigoBarras: "7704324000152"},
		{Nombre: "Clonazepam 0.5mg",   Laboratorio: "Roche",       Presentacion: "Tableta",     PrecioUnitario: 420,  Cantidad: 90,  Lote: "RC2024M", RegistroInvima: "INVIMA2021M-0056", FechaIngreso: fecha(2024,5,15), FechaVenc: fecha(2026,5,1),  CodigoBarras: "7702050001234"},
		{Nombre: "Fluoxetina 20mg",    Laboratorio: "Lafrancol",   Presentacion: "Cápsula",     PrecioUnitario: 185,  Cantidad: 120, Lote: "LF2024N", RegistroInvima: "INVIMA2020M-0189", FechaIngreso: fecha(2024,6,22), FechaVenc: fecha(2026,11,1), CodigoBarras: "7700056002201"},
		{Nombre: "Salbutamol 100mcg",  Laboratorio: "Glaxo",       Presentacion: "Inhalador",   PrecioUnitario: 28500,Cantidad: 12,  Lote: "GX2024O", RegistroInvima: "INVIMA2022M-0067", FechaIngreso: fecha(2024,7,5),  FechaVenc: fecha(2026,7,1),  CodigoBarras: "7702080001122"},
		{Nombre: "Hidroclorotiazida 25mg", Laboratorio: "Coaspharma", Presentacion: "Tableta",  PrecioUnitario: 32,   Cantidad: 400, Lote: "CP2024P", RegistroInvima: "INVIMA2018M-0201", FechaIngreso: fecha(2024,3,10), FechaVenc: fecha(2027,3,1),  CodigoBarras: "7704324000169"},
		{Nombre: "Tramadol 50mg",      Laboratorio: "Genfar",      Presentacion: "Cápsula",     PrecioUnitario: 320,  Cantidad: 55,  Lote: "GT2024Q", RegistroInvima: "INVIMA2019M-0234", FechaIngreso: fecha(2024,8,18), FechaVenc: fecha(2026,2,1),  CodigoBarras: "7702019010043"},
		{Nombre: "Naproxeno 500mg",    Laboratorio: "Bayer",       Presentacion: "Tableta",     PrecioUnitario: 85,   Cantidad: 160, Lote: "BY2024R", RegistroInvima: "INVIMA2020M-0212", FechaIngreso: fecha(2024,9,1),  FechaVenc: fecha(2026,9,1),  CodigoBarras: "4901301285447"},
		{Nombre: "Simvastatina 20mg",  Laboratorio: "MK",           Presentacion: "Tableta",     PrecioUnitario: 78,   Cantidad: 3,   Lote: "MK2024S", RegistroInvima: "INVIMA2021M-0089", FechaIngreso: fecha(2024,4,5),  FechaVenc: fecha(2025,10,1), CodigoBarras: "7704324000176"},
		{Nombre: "Ciprofloxacino 500mg",Laboratorio: "Genfar",     Presentacion: "Tableta",     PrecioUnitario: 145,  Cantidad: 230, Lote: "GT2024T", RegistroInvima: "INVIMA2019M-0267", FechaIngreso: fecha(2024,10,3), FechaVenc: fecha(2027,10,1), CodigoBarras: "7702019010050"},
	}

	for i := range productos {
		var existing models.Producto
		if db.Where("nombre = ? AND laboratorio = ?", productos[i].Nombre, productos[i].Laboratorio).First(&existing).Error != nil {
			db.Create(&productos[i])
		} else {
			productos[i] = existing
		}
	}
	fmt.Printf("✓ %d productos\n", len(productos))

	// ── ProductoEmpaques (asignar empaques a tabletas/cápsulas) ────────────
	peBatch := []struct{ prodIdx, empIdx int }{
		{0, 0}, {0, 1}, // Acetaminofén → Blister x10, Caja x30
		{1, 0},          // Ibuprofeno → Blister x10
		{4, 1}, {4, 2},  // Metformina → Caja x30, Frasco x60
		{5, 1},          // Atorvastatina → Caja x30
		{6, 3},          // Amoxicilina → Blister x14
		{11, 1},         // Losartán → Caja x30
		{19, 0},         // Ciprofloxacino → Blister x10
	}
	for _, pe := range peBatch {
		var count int64
		db.Model(&models.ProductoEmpaque{}).Where("producto_id = ? AND empaque_id = ?", productos[pe.prodIdx].ID, empaques[pe.empIdx].ID).Count(&count)
		if count == 0 {
			db.Create(&models.ProductoEmpaque{ProductoID: productos[pe.prodIdx].ID, EmpaqueID: empaques[pe.empIdx].ID})
		}
	}
	fmt.Printf("✓ empaques asociados a productos\n")

	// ── Counter de folios ──────────────────────────────────────────────────
	var counter models.Counter
	if db.Where("name = ?", "venta_folio").First(&counter).Error != nil {
		counter = models.Counter{Name: "venta_folio", Value: 0}
		db.Create(&counter)
	}

	// ── Ventas de los últimos 7 días ───────────────────────────────────────
	rng := rand.New(rand.NewSource(42))
	folioBase := int(counter.Value)
	ventasCreadas := 0

	for diasAtras := 6; diasAtras >= 0; diasAtras-- {
		dia := hoy.AddDate(0, 0, -diasAtras)
		nVentas := 4 + rng.Intn(6) // 4-9 ventas por día

		for v := 0; v < nVentas; v++ {
			hora := 8 + rng.Intn(11)
			min  := rng.Intn(60)
			fechaVenta := time.Date(dia.Year(), dia.Month(), dia.Day(), hora, min, 0, 0, bogotaLoc).UTC()

			tipoPago := "efectivo"
			if rng.Intn(3) == 0 { tipoPago = "transferencia" }

			folioBase++
			db.Model(&counter).Update("value", folioBase)

			// 1-3 productos por venta
			nItems := 1 + rng.Intn(3)
			venta := models.Venta{
				Fecha:    fechaVenta,
				TipoPago: tipoPago,
				Folio:    uint(folioBase),
			}

			var totalVenta, totalDesc float64
			items := []models.Item{}
			prodUsados := map[int]bool{}

			for i := 0; i < nItems; i++ {
				pidx := rng.Intn(len(productos))
				if prodUsados[pidx] || productos[pidx].Cantidad == 0 { continue }
				prodUsados[pidx] = true

				p := productos[pidx]
				cant := 1 + rng.Intn(5)
				if cant > p.Cantidad { cant = p.Cantidad }

				descMonto := 0.0
				descPct   := 0.0
				if rng.Intn(10) == 0 { // 10% de chance de descuento
					descPct   = float64(5 * (1 + rng.Intn(3))) // 5%, 10% o 15%
					descMonto = float64(cant) * p.PrecioUnitario * descPct / 100
				}

				subtotal := float64(cant)*p.PrecioUnitario - descMonto
				totalVenta += subtotal
				totalDesc  += descMonto

				items = append(items, models.Item{
					ProductoID:     p.ID,
					Cantidad:       cant,
					PrecioUnitario: p.PrecioUnitario,
					Descuento:      descMonto,
					DescuentoPct:   descPct,
				})

				// descontar stock (aproximado)
				db.Model(&models.Producto{}).Where("id = ?", p.ID).Update("cantidad", gorm.Expr("cantidad - ?", cant))
				productos[pidx].Cantidad -= cant
			}

			if len(items) == 0 { continue }

			venta.Total           = totalVenta
			venta.TotalDescuentos = totalDesc
			venta.Items           = items
			db.Session(&gorm.Session{FullSaveAssociations: true}).Create(&venta)
			ventasCreadas++
		}
	}
	fmt.Printf("✓ %d ventas (últimos 7 días)\n", ventasCreadas)

	// ── Egresos ────────────────────────────────────────────────────────────
	tipos    := []string{"gasto_operativo", "pago_proveedor", "retiro", "servicio"}
	conceptos := map[string][]string{
		"gasto_operativo": {"Bolsas y empaques", "Artículos de aseo", "Papelería"},
		"pago_proveedor":  {"Pago Drogas La Rebaja", "Pago distribuidora Genfar", "Pago Farmacoop"},
		"retiro":          {"Retiro propietario", "Retiro para gastos personales"},
		"servicio":        {"Servicio de internet", "Pago dominio web", "Recarga datáfono"},
	}

	egresos := []struct{ diasAtras int; tipo, concepto string; monto float64; tipoPago string }{
		{0, "gasto_operativo", "Bolsas y empaques",          12500,  "efectivo"},
		{0, "pago_proveedor",  "Pago Drogas La Rebaja",       380000, "transferencia"},
		{1, "retiro",          "Retiro propietario",           150000, "efectivo"},
		{1, "servicio",        "Servicio de internet",          89000, "transferencia"},
		{2, "gasto_operativo", "Artículos de aseo",             28000, "efectivo"},
		{3, "pago_proveedor",  "Pago distribuidora Genfar",    520000, "transferencia"},
		{4, "gasto_operativo", "Papelería",                     15000, "efectivo"},
		{5, "retiro",          "Retiro para gastos personales", 200000, "efectivo"},
		{6, "servicio",        "Recarga datáfono",               8500, "efectivo"},
	}
	_ = tipos; _ = conceptos

	egresoCreados := 0
	for _, e := range egresos {
		dia := hoy.AddDate(0, 0, -e.diasAtras)
		fechaE := time.Date(dia.Year(), dia.Month(), dia.Day(), 10+rng.Intn(8), rng.Intn(60), 0, 0, bogotaLoc).UTC()
		var count int64
		db.Model(&models.Egreso{}).Where("concepto = ? AND monto = ?", e.concepto, e.monto).Count(&count)
		if count == 0 {
			db.Create(&models.Egreso{
				Fecha:    fechaE,
				Concepto: e.concepto,
				Monto:    e.monto,
				Tipo:     e.tipo,
				TipoPago: e.tipoPago,
			})
			egresoCreados++
		}
	}
	fmt.Printf("✓ %d egresos\n", egresoCreados)

	// ── Cierre de ayer ─────────────────────────────────────────────────────
	ayer := hoy.AddDate(0, 0, -1)
	inicioAyer := time.Date(ayer.Year(), ayer.Month(), ayer.Day(), 0, 0, 0, 0, bogotaLoc).UTC()
	finAyer    := inicioAyer.Add(24 * time.Hour)

	var cierreCount int64
	db.Model(&models.CierreCaja{}).Where("fecha_inicio = ?", inicioAyer).Count(&cierreCount)
	if cierreCount == 0 {
		var ventasAyer []models.Venta
		db.Where("fecha >= ? AND fecha < ?", inicioAyer, finAyer).Find(&ventasAyer)
		var tvEf, tvTr, tv, td float64
		for _, v := range ventasAyer {
			tv += v.Total; td += v.TotalDescuentos
			if v.TipoPago == "efectivo" { tvEf += v.Total } else { tvTr += v.Total }
		}
		var egresosAyer []models.Egreso
		db.Where("fecha >= ? AND fecha < ?", inicioAyer, finAyer).Find(&egresosAyer)
		var teEf, teTr, te float64
		for _, e := range egresosAyer {
			te += e.Monto
			if e.TipoPago == "efectivo" { teEf += e.Monto } else { teTr += e.Monto }
		}
		db.Create(&models.CierreCaja{
			FechaInicio: inicioAyer, FechaFin: finAyer,
			TotalVentasEfectivo: tvEf, TotalVentasTransferencia: tvTr,
			TotalVentas: tv, TotalDescuentos: td,
			TotalEgresosEfectivo: teEf, TotalEgresosTransferencia: teTr,
			TotalEgresos: te, NetoCaja: tvEf - teEf,
			Observacion: "Cierre generado por seed",
		})
		fmt.Printf("✓ cierre de caja de ayer\n")
	}

	fmt.Println("\n🎉 Seed completado. Iniciá el servidor con: SQLITE_PATH=./dev.db go run main.go")
}
