package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"salo_plus/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {

	// Leer la variable de entorno
	dsn := "postgres://u3qj45epbhvltf:pddd42837d052b70a9927f5f61b59b26d883dd3ff3b77488792dcc800077d4fa8@cer3tutrbi7n1t.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/d943tmcccgq9ki"

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Error conectando a la base de datos:", err)
	}
	log.Println("Migración completada correctamente.")

	// migrar modelos (solo productos/ventas/counters)
	if err := db.AutoMigrate(&models.Producto{}, &models.Venta{}, &models.Counter{}); err != nil {
		panic(err)
	}

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

	// ventas en lote (atómicas)
	r.POST("/ventas/lote", func(c *gin.Context) {
		// payload esperado
		type item struct {
			ProductoID     uint    `json:"producto_id"`
			Cantidad       int     `json:"cantidad"`
			PrecioUnitario float64 `json:"precio_unitario"`
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

		var ventas []models.Venta
		var total float64

		// Generar un solo folio para toda la transacción en lote
		folioLote, err := nextFolio(tx)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		for _, it := range in.Items {
			// flujo por Producto (único soportado)
			var p models.Producto
			if err := tx.First(&p, it.ProductoID).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado"})
				return
			}
			if p.Cantidad < it.Cantidad {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "Stock insuficiente"})
				return
			}
			v := models.Venta{
				Fecha:          fecha,
				TipoPago:       in.TipoPago,
				ProductoID:     it.ProductoID,
				Cantidad:       it.Cantidad,
				PrecioUnitario: it.PrecioUnitario,
				Total:          float64(it.Cantidad) * it.PrecioUnitario,
				Folio:          folioLote,
			}
			if err := tx.Create(&v).Error; err != nil {
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
			total += v.Total
			ventas = append(ventas, v)
		}

		// cargar relación producto para respuesta
		for i := range ventas {
			tx.Preload("Producto").First(&ventas[i], ventas[i].ID)
		}

		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"ventas":     ventas,
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
		// Ignoramos los query params aquí; el JS hace la consulta a /ventas
		c.HTML(http.StatusOK, "historial_ventas.html", nil)
	})

	// -------------------- Productos --------------------
	r.GET("/productos", func(c *gin.Context) {
		var productos []models.Producto
		db.Find(&productos)
		c.JSON(http.StatusOK, productos)
	})

	r.POST("/productos", func(c *gin.Context) {
		var p models.Producto
		if err := c.ShouldBindJSON(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := db.Create(&p).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		// Normalizar CB vacío a NULL
		if strings.TrimSpace(p.CodigoBarras) == "" {
			db.Exec("UPDATE productos SET codigo_barras = NULL WHERE id = ?", p.ID)
			p.CodigoBarras = ""
		}
		c.JSON(http.StatusCreated, p)
	})

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
		// actualizar campos permitidos
		p.FechaIngreso = in.FechaIngreso
		p.Nombre = in.Nombre
		p.Laboratorio = in.Laboratorio
		p.Presentacion = in.Presentacion
		p.Cantidad = in.Cantidad
		p.Lote = in.Lote
		p.RegistroInvima = in.RegistroInvima
		p.FechaVenc = in.FechaVenc
		p.Observacion = in.Observacion

		// Si CB viene vacío, setear NULL en DB para evitar conflictos de unicidad
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

	r.DELETE("/productos/:id", func(c *gin.Context) {
		if err := db.Delete(&models.Producto{}, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
	})

	// búsqueda por nombre, lote o registro_invima
	r.GET("/buscar", func(c *gin.Context) {
		q := c.Query("q")
		var productos []models.Producto
		if q == "" {
			db.Limit(50).Find(&productos)
		} else {
			like := fmt.Sprintf("%%%s%%", q)
			db.Where("nombre LIKE ? OR lote LIKE ? OR registro_invima LIKE ? OR codigo_barras LIKE ?", like, like, like, like).Find(&productos)
		}
		c.JSON(http.StatusOK, productos)
	})

	// -------------------- Ventas --------------------
	r.POST("/ventas", func(c *gin.Context) {
		var v models.Venta
		if err := c.ShouldBindJSON(&v); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		var p models.Producto
		if err := db.First(&p, v.ProductoID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Producto no encontrado"})
			return
		}
		if p.Cantidad < v.Cantidad {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Stock insuficiente"})
			return
		}
		if v.Fecha.IsZero() {
			v.Fecha = time.Now()
		}
		v.Total = float64(v.Cantidad) * v.PrecioUnitario
		tx := db.Begin()
		if err := tx.Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		folio, err := nextFolio(tx)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		v.Folio = folio
		if err := tx.Create(&v).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		p.Cantidad -= v.Cantidad
		if err := tx.Save(&p).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"venta": v, "producto": p})
	})

	// listar ventas con filtros y totales (solo Producto)
	r.GET("/ventas", func(c *gin.Context) {
		desde := c.Query("desde") // YYYY-MM-DD
		hasta := c.Query("hasta") // YYYY-MM-DD

		var ventas []models.Venta
		query := db.Preload("Producto").Order("fecha desc")

		if desde != "" {
			if d, err := time.Parse("2006-01-02", desde); err == nil {
				query = query.Where("fecha >= ?", d)
			}
		}
		if hasta != "" {
			if h, err := time.Parse("2006-01-02", hasta); err == nil {
				h = h.Add(24*time.Hour - time.Second)
				query = query.Where("fecha <= ?", h)
			}
		}

		if err := query.Find(&ventas).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var totalGeneral float64
		var totalHoy float64
		hoyStr := time.Now().Format("2006-01-02")
		for _, v := range ventas {
			totalGeneral += v.Total
			if v.Fecha.Format("2006-01-02") == hoyStr {
				totalHoy += v.Total
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"ventas":        ventas,
			"total_general": totalGeneral,
			"total_hoy":     totalHoy,
		})
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
