package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"salo_plus/models"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// al tope del archivo:
var bogotaLoc = func() *time.Location {
	loc, err := time.LoadLocation("America/Bogota")
	if err != nil {
		panic(err)
	}
	return loc
}()

func main() {

	// Config DB: si SQLITE_PATH está definido, usamos SQLite; de lo contrario Postgres (DATABASE_URL o DSN fijo)
	var db *gorm.DB
	var err error
	if sqlitePath := os.Getenv("SQLITE_PATH"); sqlitePath != "" {
		if sqlitePath == "memory" { // atajo para memoria
			sqlitePath = ":memory:"
		}
		log.Println("Usando SQLite en:", sqlitePath)
		db, err = gorm.Open(sqlite.Open(sqlitePath), &gorm.Config{})
	} else {
		dsn := os.Getenv("DATABASE_URL")
		if dsn == "" {
			// DSN por defecto (productivo). Reemplázalo por envs en tu despliegue.
			dsn = "postgres://u3qj45epbhvltf:pddd42837d052b70a9927f5f61b59b26d883dd3ff3b77488792dcc800077d4fa8@cer3tutrbi7n1t.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/d943tmcccgq9ki"
		}
		log.Println("Usando Postgres (DATABASE_URL)")
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	}
	if err != nil {
		log.Fatal("Error conectando a la base de datos:", err)
	}
	log.Println("Migración completada correctamente.")

	// migrar modelos (productos/ventas/items/counters/empaques/producto_empaques)
	if err := db.AutoMigrate(&models.Producto{}, &models.Venta{}, &models.Item{}, &models.Counter{}, &models.Empaque{}, &models.ProductoEmpaque{}); err != nil {
		panic(err)
	}
	// Limpieza: eliminamos manejo legado de SKU/Lote. Si existen columnas antiguas en BD, puedes borrarlas manualmente.

	r := gin.Default()

	// servir assets (pon tu static y templates en esas carpetas)
	r.Static("/static", "./static") // Sirve archivos estáticos en /static/*
	r.Static("/images", "./images") // Sirve imágenes en /images/*
	r.LoadHTMLGlob("templates/*")

	// Página principal (puedes usar la index.html que ya definimos antes)
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	// Healthcheck simple
	r.GET("/healthz", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	// helpers de fecha removidos (no usados)

	// helper: siguiente folio (usar SIEMPRE dentro de una tx)
	nextFolio := func(tx *gorm.DB) (uint, error) {
		var c models.Counter
		if err := tx.Where("name = ?", "venta_folio").First(&c).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c = models.Counter{Name: "venta_folio", Value: 0}
				if err := tx.Create(&c).Error; err != nil {
					return 0, err
				}
			} else {
				return 0, err
			}
		}
		c.Value = c.Value + 1
		if err := tx.Save(&c).Error; err != nil {
			return 0, err
		}
		return c.Value, nil
	}

	// ventas en lote (atómicas) - ahora crea UNA sola venta con múltiples items bajo un mismo folio
	r.POST("/ventas/lote", func(c *gin.Context) {
		// payload esperado
		type item struct {
			ProductoID       uint `json:"producto_id"`
			Cantidad         int  `json:"cantidad"`          // unidades base (si no se usa empaque)
			EmpaqueID        uint `json:"empaque_id"`        // opcional
			CantidadEmpaques int  `json:"cantidad_empaques"` // opcional, usado si EmpaqueID > 0
		}
		type payload struct {
			Fecha    string `json:"fecha"` // ISO opcional
			TipoPago string `json:"tipo_pago"`
			Items    []item `json:"items"`
		}

		var in payload
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if len(in.Items) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "items vacíos"})
			return
		}

		// fecha
		fecha := time.Now()
		if in.Fecha != "" {
			if t, err := time.Parse(time.RFC3339, in.Fecha); err == nil {
				fecha = t
			}
		}

		tx := db.Begin()
		if err := tx.Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Generar un solo folio para toda la transacción en lote
		folioLote, err := nextFolio(tx)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Validar stock y calcular total (con soporte de empaques)
		var total float64
		precios := make(map[uint]float64) // precio unitario efectivo por ProductoID
		cantidades := make(map[uint]int)  // cantidad en unidades base por ProductoID (sumada por si repite)
		for _, it := range in.Items {
			var p models.Producto
			if err := tx.First(&p, it.ProductoID).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado"})
				return
			}
			unidades := it.Cantidad
			precioUnit := p.PrecioUnitario
			// Validar empaque si se especifica
			if it.EmpaqueID > 0 {
				var em models.Empaque
				if err := tx.First(&em, it.EmpaqueID).Error; err != nil {
					tx.Rollback()
					c.JSON(http.StatusBadRequest, gin.H{"error": "Empaque no encontrado"})
					return
				}
				if em.FactorConversion <= 0 {
					tx.Rollback()
					c.JSON(http.StatusBadRequest, gin.H{"error": "Factor de empaque inválido"})
					return
				}
				unidades = it.CantidadEmpaques * em.FactorConversion
				// El precio se mantiene del producto, ya no hay override por empaque
			}
			if p.Cantidad < unidades {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "Stock insuficiente para " + strconv.Itoa(unidades) + " unidades: " + p.Nombre + " (" + strconv.Itoa(p.Cantidad) + " disponibles)"})
				return
			}
			precios[it.ProductoID] = precioUnit
			cantidades[it.ProductoID] += unidades
			total += float64(unidades) * precioUnit
		}

		// Construir venta con items
		venta := models.Venta{
			Fecha:    fecha,
			TipoPago: in.TipoPago,
			Folio:    folioLote,
			Total:    total,
		}
		venta.Items = make([]models.Item, 0, len(cantidades))
		for pid, unidades := range cantidades {
			venta.Items = append(venta.Items, models.Item{
				ProductoID:     pid,
				Cantidad:       unidades,
				PrecioUnitario: precios[pid],
			})
		}

		// Crear venta con asociación de Items (asegurando guardar todos los campos y las asociaciones)
		if err := tx.Session(&gorm.Session{FullSaveAssociations: true}).Create(&venta).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Descontar stock por cada item
		for _, it := range venta.Items {
			var p models.Producto
			if err := tx.First(&p, it.ProductoID).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			p.Cantidad -= it.Cantidad
			if err := tx.Save(&p).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}

		// Recargar asociaciones
		if err := tx.Preload("Items").Preload("Items.Producto").First(&venta, venta.ID).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"venta":      venta,
			"total":      total,
			"fecha":      fecha,
			"folio_lote": folioLote,
		})
	})

	// Página de administración de ventas
	r.GET("/admin_ventas", func(c *gin.Context) {
		c.HTML(http.StatusOK, "admin_ventas.html", nil)
	})

	// Página alternativa de historial de ventas
	r.GET("/historial_ventas", func(c *gin.Context) {
		c.HTML(http.StatusOK, "historial_ventas.html", nil)
	})
	// Alias compatible: /historial
	r.GET("/historial", func(c *gin.Context) {
		c.HTML(http.StatusOK, "historial_ventas.html", nil)
	})

	// -------------------- Productos --------------------
	// GET /productos con paginación opcional (?page=&size=)
	r.GET("/productos", func(c *gin.Context) {
		pageStr := c.Query("page")
		sizeStr := c.Query("size")
		if pageStr != "" && sizeStr != "" {
			var productos []models.Producto
			var total int64
			if err := db.Model(&models.Producto{}).Count(&total).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			page, size := 1, 20
			fmt.Sscanf(pageStr, "%d", &page)
			fmt.Sscanf(sizeStr, "%d", &size)
			if page < 1 {
				page = 1
			}
			if size < 1 {
				size = 20
			}
			offset := (page - 1) * size
			if err := db.Preload("ProductoEmpaques.Empaque").Order("id desc").Limit(size).Offset(offset).Find(&productos).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			pages := 1
			if size > 0 {
				pages = int((total + int64(size) - 1) / int64(size))
			}
			c.JSON(http.StatusOK, gin.H{"items": productos, "total": total, "page": page, "pages": pages})
			return
		}
		var productos []models.Producto
		db.Preload("ProductoEmpaques.Empaque").Order("id desc").Find(&productos)
		c.JSON(http.StatusOK, productos)
	})

	// POST /productos
	r.POST("/productos", func(c *gin.Context) {
		var requestData struct {
			models.Producto
			EmpaquesSeleccionados []struct {
				ID uint `json:"ID"`
			} `json:"empaques_seleccionados,omitempty"`
		}

		if err := c.ShouldBindJSON(&requestData); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Crear el producto
		p := requestData.Producto
		if err := db.Create(&p).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Limpiar código de barras vacío
		if strings.TrimSpace(p.CodigoBarras) == "" {
			db.Exec("UPDATE productos SET codigo_barras = NULL WHERE id = ?", p.ID)
			p.CodigoBarras = ""
		}

		// Asociar empaques existentes al producto
		if len(requestData.EmpaquesSeleccionados) > 0 {
			for _, empaqueRef := range requestData.EmpaquesSeleccionados {
				// Crear la relación producto-empaque
				productoEmpaque := models.ProductoEmpaque{
					ProductoID: p.ID,
					EmpaqueID:  empaqueRef.ID,
				}
				db.Create(&productoEmpaque)
			}
		}

		// Recargar el producto con sus empaques
		db.Preload("ProductoEmpaques.Empaque").First(&p, p.ID)

		c.JSON(http.StatusCreated, p)
	})

	// GET /productos/:id - Obtener un producto específico
	r.GET("/productos/:id", func(c *gin.Context) {
		var p models.Producto
		if err := db.Preload("ProductoEmpaques.Empaque").First(&p, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado"})
			return
		}
		c.JSON(http.StatusOK, p)
	})

	// PUT /productos/:id
	r.PUT("/productos/:id", func(c *gin.Context) {
		var p models.Producto
		if err := db.First(&p, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado"})
			return
		}
		var in models.Producto
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		p.FechaIngreso = in.FechaIngreso
		p.Nombre = in.Nombre
		p.Laboratorio = in.Laboratorio
		p.Presentacion = in.Presentacion
		p.Cantidad = in.Cantidad
		p.PrecioUnitario = in.PrecioUnitario
		p.Lote = in.Lote
		p.RegistroInvima = in.RegistroInvima
		p.FechaVenc = in.FechaVenc
		p.Observacion = in.Observacion
		if strings.TrimSpace(in.CodigoBarras) == "" {
			in.CodigoBarras = ""
		}
		p.CodigoBarras = in.CodigoBarras
		if err := db.Save(&p).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if strings.TrimSpace(p.CodigoBarras) == "" {
			db.Exec("UPDATE productos SET codigo_barras = NULL WHERE id = ?", p.ID)
		}
		c.JSON(http.StatusOK, p)
	})

	// DELETE /productos/:id
	r.DELETE("/productos/:id", func(c *gin.Context) {
		if err := db.Delete(&models.Producto{}, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
	})

	// -------------------- Empaques --------------------

	// Obtener todos los tipos de empaque genéricos
	r.GET("/empaques", func(c *gin.Context) {
		var empaques []models.Empaque

		if err := db.Find(&empaques).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, empaques)
	})

	// Crear empaque
	r.POST("/empaques", func(c *gin.Context) {
		var empaque models.Empaque
		if err := c.ShouldBindJSON(&empaque); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := db.Create(&empaque).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, empaque)
	})

	// Obtener empaque por ID
	r.GET("/empaques/:id", func(c *gin.Context) {
		id := c.Param("id")
		var empaque models.Empaque
		if err := db.First(&empaque, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Empaque no encontrado"})
			return
		}
		c.JSON(http.StatusOK, empaque)
	})

	// Obtener empaques asociados a un producto
	r.GET("/productos/:id/empaques", func(c *gin.Context) {
		var productoEmpaques []models.ProductoEmpaque
		if err := db.Preload("Empaque").Where("producto_id = ?", c.Param("id")).Find(&productoEmpaques).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, productoEmpaques)
	})

	// Actualizar empaque
	r.PUT("/empaques/:id", func(c *gin.Context) {
		var em models.Empaque
		if err := db.First(&em, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Empaque no encontrado"})
			return
		}
		var in models.Empaque
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		em.Tipo = in.Tipo
		em.FactorConversion = in.FactorConversion
		em.Descripcion = in.Descripcion
		if err := db.Save(&em).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, em)
	})

	// Eliminar empaque
	r.DELETE("/empaques/:id", func(c *gin.Context) {
		if err := db.Delete(&models.Empaque{}, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
	})

	// ===== RUTAS PRODUCTO-EMPAQUE =====

	// POST /producto-empaques - Crear asociación producto-empaque
	r.POST("/producto-empaques", func(c *gin.Context) {
		var pe models.ProductoEmpaque
		if err := c.ShouldBindJSON(&pe); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Verificar que el producto existe
		var producto models.Producto
		if err := db.First(&producto, pe.ProductoID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado"})
			return
		}

		// Verificar que el empaque existe
		var empaque models.Empaque
		if err := db.First(&empaque, pe.EmpaqueID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Empaque no encontrado"})
			return
		}

		// Verificar que no existe ya la asociación
		var existing models.ProductoEmpaque
		if err := db.Where("producto_id = ? AND empaque_id = ?", pe.ProductoID, pe.EmpaqueID).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Ya existe esta asociación producto-empaque"})
			return
		}

		// Crear la asociación
		if err := db.Create(&pe).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Cargar la asociación completa con relaciones
		if err := db.Preload("Producto").Preload("Empaque").First(&pe, pe.ID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error cargando asociación creada"})
			return
		}

		c.JSON(http.StatusCreated, pe)
	})

	// DELETE /producto-empaques/:id - Eliminar asociación producto-empaque
	r.DELETE("/producto-empaques/:id", func(c *gin.Context) {
		if err := db.Delete(&models.ProductoEmpaque{}, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
	})

	// GET /buscar (paginación opcional)
	r.GET("/buscar", func(c *gin.Context) {
		q := c.Query("q")
		pageStr := c.Query("page")
		sizeStr := c.Query("size")
		like := fmt.Sprintf("%%%s%%", q)
		if pageStr != "" && sizeStr != "" {
			var productos []models.Producto
			var total int64
			tx := db.Model(&models.Producto{})
			if q != "" {
				tx = tx.Where("nombre LIKE ? OR lote LIKE ? OR registro_invima LIKE ? OR codigo_barras LIKE ?", like, like, like, like)
			}
			if err := tx.Count(&total).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			page, size := 1, 20
			fmt.Sscanf(pageStr, "%d", &page)
			fmt.Sscanf(sizeStr, "%d", &size)
			if page < 1 {
				page = 1
			}
			if size < 1 {
				size = 20
			}
			offset := (page - 1) * size
			if err := tx.Preload("ProductoEmpaques.Empaque").Order("id desc").Limit(size).Offset(offset).Find(&productos).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			pages := 1
			if size > 0 {
				pages = int((total + int64(size) - 1) / int64(size))
			}
			c.JSON(http.StatusOK, gin.H{"items": productos, "total": total, "page": page, "pages": pages})
			return
		}
		var productos []models.Producto
		if q == "" {
			db.Preload("ProductoEmpaques.Empaque").Limit(50).Order("id desc").Find(&productos)
		} else {
			db.Preload("ProductoEmpaques.Empaque").Where("nombre LIKE ? OR lote LIKE ? OR registro_invima LIKE ? OR codigo_barras LIKE ?", like, like, like, like).Order("id desc").Find(&productos)
		}
		c.JSON(http.StatusOK, productos)
	})

	// -------------------- Ventas {individual} --------------------
	r.POST("/ventas", func(c *gin.Context) {
		var v models.Venta
		if err := c.ShouldBindJSON(&v); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if len(v.Items) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "items vacíos"})
			return
		}
		if v.Fecha.IsZero() {
			v.Fecha = time.Now()
		}
		var total float64
		tx := db.Begin()
		if err := tx.Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		for i := range v.Items {
			var p models.Producto
			if err := tx.First(&p, v.Items[i].ProductoID).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado"})
				return
			}
			if p.Cantidad < v.Items[i].Cantidad {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "Stock insuficiente para el producto: " + p.Nombre + " (" + p.Lote + ")" + " (" + p.RegistroInvima + ")" + " (" + p.CodigoBarras + ")"})
				return
			}
			v.Items[i].PrecioUnitario = p.PrecioUnitario
			total += float64(v.Items[i].Cantidad) * p.PrecioUnitario
		}
		v.Total = total
		folio, err := nextFolio(tx)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		v.Folio = folio
		if err := tx.Session(&gorm.Session{FullSaveAssociations: true}).Create(&v).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		for i := range v.Items {
			var p models.Producto
			if err := tx.First(&p, v.Items[i].ProductoID).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			p.Cantidad -= v.Items[i].Cantidad
			if err := tx.Save(&p).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := db.Preload("Items").Preload("Items.Producto").First(&v, v.ID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"venta": v})
	})

	// listar ventas con filtros y totales (solo Producto)
	r.GET("/ventas", func(c *gin.Context) {
		desde := c.Query("desde") // YYYY-MM-DD (interpretada como BOGOTÁ)
		hasta := c.Query("hasta") // YYYY-MM-DD (interpretada como BOGOTÁ)

		// Construimos rangos en UTC a partir de fechas LOCALES de Bogotá
		var startUTC, endUTC *time.Time

		// helper para día local -> [inicioUTC, finUTC)
		parseDayRangeUTC := func(dayStr string) (time.Time, time.Time, error) {
			// Interpretar el string como fecha local en Bogotá
			dLocal, err := time.ParseInLocation("2006-01-02", dayStr, bogotaLoc)
			if err != nil {
				return time.Time{}, time.Time{}, err
			}
			startLocal := time.Date(dLocal.Year(), dLocal.Month(), dLocal.Day(), 0, 0, 0, 0, bogotaLoc)
			endLocal := startLocal.Add(24 * time.Hour)
			return startLocal.UTC(), endLocal.UTC(), nil
		}

		var ventas []models.Venta
		query := db.Preload("Items").Preload("Items.Producto").Order("fecha desc")

		// Base query para los SUM (sin Preload, solo filtros de fecha)
		sumaBase := db.Model(&models.Venta{})

		if desde != "" && hasta != "" {
			sUTC, _, err1 := parseDayRangeUTC(desde)
			_, hEndUTC, err2 := parseDayRangeUTC(hasta)
			if err1 == nil && err2 == nil {
				startUTC = &sUTC
				endUTC = &hEndUTC
				query = query.Where("fecha >= ? AND fecha < ?", *startUTC, *endUTC)
				sumaBase = sumaBase.Where("fecha >= ? AND fecha < ?", *startUTC, *endUTC)
			}
		} else if desde != "" {
			sUTC, _, err := parseDayRangeUTC(desde)
			if err == nil {
				startUTC = &sUTC
				query = query.Where("fecha >= ?", *startUTC)
				sumaBase = sumaBase.Where("fecha >= ?", *startUTC)
			}
		} else if hasta != "" {
			_, eUTC, err := parseDayRangeUTC(hasta)
			if err == nil {
				endUTC = &eUTC
				query = query.Where("fecha < ?", *endUTC)
				sumaBase = sumaBase.Where("fecha < ?", *endUTC)
			}
		}

		if err := query.Find(&ventas).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// total_general: SUM directo en la BD sobre el rango filtrado
		// Evita iterar todos los registros en Go solo para sumar
		var totalGeneral float64
		sumaBase.Select("COALESCE(SUM(total), 0)").Scan(&totalGeneral)

		// total_hoy: SUM directo en la BD solo para el día de hoy en Bogotá
		var totalHoy float64
		hoyLocal := time.Now().In(bogotaLoc)
		hoyStartUTC := time.Date(hoyLocal.Year(), hoyLocal.Month(), hoyLocal.Day(), 0, 0, 0, 0, bogotaLoc).UTC()
		hoyEndUTC := hoyStartUTC.Add(24 * time.Hour)
		db.Model(&models.Venta{}).
			Select("COALESCE(SUM(total), 0)").
			Where("fecha >= ? AND fecha < ?", hoyStartUTC, hoyEndUTC).
			Scan(&totalHoy)

		c.JSON(http.StatusOK, gin.H{
			"ventas":        ventas,
			"total_general": totalGeneral,
			"total_hoy":     totalHoy,
		})
	})

	// Ruta para la página de gestión de empaques
	r.GET("/admin_empaques", func(c *gin.Context) {
		c.HTML(http.StatusOK, "admin_empaques.html", nil)
	})

	// Usar PORT de entorno (Render/Railway/etc.)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Println("Servidor iniciado en http://localhost:" + port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
