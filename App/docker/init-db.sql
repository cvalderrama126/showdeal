-- ============================================
-- ShowDeal Database Initialization Script
-- PostgreSQL 15+
-- ============================================
-- Este script se ejecuta automáticamente cuando
-- se levanta el contenedor de PostgreSQL por primera vez.

-- ============================================
-- 1. CREAR SCHEMA
-- ============================================
CREATE SCHEMA IF NOT EXISTS showdeal;

-- ============================================
-- 2. CREAR TABLAS CORE
-- ============================================

-- Roles (Admin, User, Buyer, Seller, etc.)
CREATE TABLE IF NOT EXISTS showdeal.r_role (
  id_role BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  role_name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  additional JSONB
);

-- Módulos (CRUD para diferentes entidades)
CREATE TABLE IF NOT EXISTS showdeal.r_module (
  id_module BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  module_name VARCHAR(255) NOT NULL UNIQUE,
  url_name VARCHAR(255),
  description TEXT,
  module_order INT DEFAULT 0,
  icon VARCHAR(255),
  additional JSONB
);

-- Control de Acceso (Role-Based Access Control)
CREATE TABLE IF NOT EXISTS showdeal.r_access (
  id_access BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  id_module BIGINT NOT NULL REFERENCES showdeal.r_module(id_module) ON DELETE CASCADE,
  id_role BIGINT NOT NULL REFERENCES showdeal.r_role(id_role) ON DELETE CASCADE,
  is_insert BOOLEAN DEFAULT false,
  is_update BOOLEAN DEFAULT false,
  is_delete BOOLEAN DEFAULT false,
  additional JSONB,
  UNIQUE(id_module, id_role)
);

-- Usuarios
CREATE TABLE IF NOT EXISTS showdeal.r_user (
  id_user BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  id_role BIGINT NOT NULL REFERENCES showdeal.r_role(id_role),
  phone VARCHAR(20),
  full_name VARCHAR(255),
  otp_enabled BOOLEAN DEFAULT false,
  otp_secret VARCHAR(255),
  last_login TIMESTAMP(6),
  additional JSONB
);

-- Empresas
CREATE TABLE IF NOT EXISTS showdeal.r_company (
  id_company BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  company_name VARCHAR(255) NOT NULL,
  registration_number VARCHAR(255) UNIQUE,
  tax_id VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  address VARCHAR(255),
  city VARCHAR(255),
  country VARCHAR(255),
  website VARCHAR(255),
  id_user_admin BIGINT REFERENCES showdeal.r_user(id_user),
  additional JSONB
);

-- Activos para subastar
CREATE TABLE IF NOT EXISTS showdeal.r_asset (
  id_asset BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  uin VARCHAR(255) NOT NULL UNIQUE,
  tp_asset VARCHAR(255),
  status VARCHAR(100) DEFAULT 'active',
  book_value DECIMAL(18, 2) DEFAULT 0,
  appraised_value DECIMAL(18, 2) DEFAULT 0,
  expected_value DECIMAL(18, 2) DEFAULT 0,
  reserve_price DECIMAL(18, 2) DEFAULT 0,
  starting_bid DECIMAL(18, 2) DEFAULT 0,
  realized_value DECIMAL(18, 2) DEFAULT 0,
  location_city VARCHAR(255),
  location_address VARCHAR(255),
  version_number INT DEFAULT 1,
  additional JSONB
);

-- Subastas
CREATE TABLE IF NOT EXISTS showdeal.r_auction (
  id_auction BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  id_asset BIGINT NOT NULL REFERENCES showdeal.r_asset(id_asset) ON DELETE CASCADE,
  auction_date DATE,
  auction_start_time TIMESTAMP(6),
  auction_end_time TIMESTAMP(6),
  auction_status VARCHAR(100) DEFAULT 'scheduled',
  final_bid_price DECIMAL(18, 2),
  winning_bidder_id BIGINT REFERENCES showdeal.r_user(id_user),
  location_description VARCHAR(255),
  auction_notes TEXT,
  additional JSONB
);

-- Pujas
CREATE TABLE IF NOT EXISTS showdeal.r_bid (
  id_bid BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  id_auction BIGINT NOT NULL REFERENCES showdeal.r_auction(id_auction) ON DELETE CASCADE,
  id_user BIGINT NOT NULL REFERENCES showdeal.r_user(id_user) ON DELETE CASCADE,
  bid_amount DECIMAL(18, 2) NOT NULL,
  bid_status VARCHAR(100) DEFAULT 'active',
  additional JSONB
);

-- Eventos (Log de actividades)
CREATE TABLE IF NOT EXISTS showdeal.r_event (
  id_event BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  event_type VARCHAR(255),
  event_entity VARCHAR(255),
  event_entity_id BIGINT,
  id_user BIGINT REFERENCES showdeal.r_user(id_user) ON DELETE SET NULL,
  event_description TEXT,
  event_data JSONB,
  additional JSONB
);

-- Archivos Adjuntos
CREATE TABLE IF NOT EXISTS showdeal.r_attach (
  id_attach BIGSERIAL PRIMARY KEY,
  ins_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  upd_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  id_asset BIGINT REFERENCES showdeal.r_asset(id_asset) ON DELETE CASCADE,
  id_auction BIGINT REFERENCES showdeal.r_auction(id_auction) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size BIGINT,
  id_user_uploaded BIGINT REFERENCES showdeal.r_user(id_user),
  description TEXT,
  additional JSONB
);

-- ============================================
-- 3. CREAR ÍNDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_r_access_id_module ON showdeal.r_access(id_module);
CREATE INDEX IF NOT EXISTS idx_r_access_id_role ON showdeal.r_access(id_role);
CREATE INDEX IF NOT EXISTS idx_r_user_email ON showdeal.r_user(email);
CREATE INDEX IF NOT EXISTS idx_r_user_id_role ON showdeal.r_user(id_role);
CREATE INDEX IF NOT EXISTS idx_r_user_is_active ON showdeal.r_user(is_active);
CREATE INDEX IF NOT EXISTS idx_r_asset_uin ON showdeal.r_asset(uin);
CREATE INDEX IF NOT EXISTS idx_r_asset_status ON showdeal.r_asset(status);
CREATE INDEX IF NOT EXISTS idx_r_auction_id_asset ON showdeal.r_auction(id_asset);
CREATE INDEX IF NOT EXISTS idx_r_auction_status ON showdeal.r_auction(auction_status);
CREATE INDEX IF NOT EXISTS idx_r_bid_id_auction ON showdeal.r_bid(id_auction);
CREATE INDEX IF NOT EXISTS idx_r_bid_id_user ON showdeal.r_bid(id_user);
CREATE INDEX IF NOT EXISTS idx_r_event_event_type ON showdeal.r_event(event_type);
CREATE INDEX IF NOT EXISTS idx_r_attach_id_asset ON showdeal.r_attach(id_asset);

-- ============================================
-- 4. SEED DATA - Datos Iniciales
-- ============================================

-- Roles Base
INSERT INTO showdeal.r_role (role_name, description) VALUES
  ('ADMIN', 'Administrador del sistema'),
  ('USER', 'Usuario base'),
  ('BUYER', 'Comprador en subastas'),
  ('SELLER', 'Vendedor de activos'),
  ('AUCTIONEER', 'Manejador de subastas')
ON CONFLICT (role_name) DO NOTHING;

-- Módulos CRUD
INSERT INTO showdeal.r_module (module_name, url_name, description, module_order) VALUES
  ('Users', 'users', 'Gestión de usuarios', 1),
  ('Roles', 'roles', 'Gestión de roles', 2),
  ('Modules', 'modules', 'Gestión de módulos', 3),
  ('Access', 'access', 'Control de acceso', 4),
  ('Companies', 'companies', 'Gestión de empresas', 5),
  ('Assets', 'assets', 'Gestión de activos', 6),
  ('Auctions', 'auctions', 'Gestión de subastas', 7),
  ('Bids', 'bids', 'Gestión de pujas', 8),
  ('Events', 'events', 'Log de eventos', 9),
  ('Attachments', 'attachments', 'Gestión de archivos', 10)
ON CONFLICT (module_name) DO NOTHING;

-- Permisos por defecto: ADMIN tiene acceso a todo
WITH admin_role AS (SELECT id_role FROM showdeal.r_role WHERE role_name = 'ADMIN'),
     all_modules AS (SELECT id_module FROM showdeal.r_module)
INSERT INTO showdeal.r_access (id_module, id_role, is_insert, is_update, is_delete)
SELECT m.id_module, a.id_role, true, true, true
FROM all_modules m, admin_role a
ON CONFLICT (id_module, id_role) DO NOTHING;

-- Usuario Admin por defecto (contraseña: admin123 - cambiar en producción)
INSERT INTO showdeal.r_user 
(email, password_hash, id_role, full_name, phone) 
SELECT 
  'admin@showdeal.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4JlFm', -- bcrypt hash de "password"
  r.id_role,
  'Admin User',
  '+1-555-0000'
FROM showdeal.r_role r
WHERE r.role_name = 'ADMIN'
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- 5. GRANTS - Permisos de BD para usuario app
-- ============================================
GRANT ALL PRIVILEGES ON SCHEMA showdeal TO showdeal;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA showdeal TO showdeal;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA showdeal TO showdeal;
GRANT USAGE ON SCHEMA showdeal TO showdeal;

-- ============================================
-- 6. COMENTARIOS (Documentación de Tablas)
-- ============================================
COMMENT ON SCHEMA showdeal IS 'Schema principal de ShowDeal - Aplicación de subastas en línea';
COMMENT ON TABLE showdeal.r_role IS 'Roles del sistema (ADMIN, USER, BUYER, SELLER, AUCTIONEER)';
COMMENT ON TABLE showdeal.r_module IS 'Módulos CRUD disponibles en la aplicación';
COMMENT ON TABLE showdeal.r_access IS 'Control de acceso basado en roles (RBAC)';
COMMENT ON TABLE showdeal.r_user IS 'Usuarios del sistema';
COMMENT ON TABLE showdeal.r_company IS 'Empresas/Vendedores';
COMMENT ON TABLE showdeal.r_asset IS 'Activos disponibles para subastar';
COMMENT ON TABLE showdeal.r_auction IS 'Subastas programadas';
COMMENT ON TABLE showdeal.r_bid IS 'Pujas en subastas';
COMMENT ON TABLE showdeal.r_event IS 'Log de eventos/auditoría';
COMMENT ON TABLE showdeal.r_attach IS 'Archivos adjuntos (fotos, documentos, etc.)';

