--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: showdeal; Type: SCHEMA; Schema: -; Owner: showdeal
--

CREATE SCHEMA showdeal;


ALTER SCHEMA showdeal OWNER TO showdeal;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA showdeal;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: fn_attach_metadata(); Type: FUNCTION; Schema: showdeal; Owner: showdeal
--

CREATE FUNCTION showdeal.fn_attach_metadata() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.content IS NOT NULL THEN
    NEW.file_size_bytes = octet_length(NEW.content);
    NEW.file_hash = encode(digest(NEW.content, 'sha256'), 'hex');
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION showdeal.fn_attach_metadata() OWNER TO showdeal;

--
-- Name: fn_set_upd_at(); Type: FUNCTION; Schema: showdeal; Owner: showdeal
--

CREATE FUNCTION showdeal.fn_set_upd_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.upd_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION showdeal.fn_set_upd_at() OWNER TO showdeal;

--
-- Name: r_log_id_log_seq; Type: SEQUENCE; Schema: public; Owner: showdeal
--

CREATE SEQUENCE public.r_log_id_log_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.r_log_id_log_seq OWNER TO showdeal;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: r_access; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_access (
    id_access bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    id_module bigint NOT NULL,
    id_role bigint NOT NULL,
    is_insert boolean DEFAULT false NOT NULL,
    is_update boolean DEFAULT false NOT NULL,
    is_delete boolean DEFAULT false NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_access OWNER TO showdeal;

--
-- Name: COLUMN r_access.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_access.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_access.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_access.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: r_access_id_access_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_access_id_access_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_access_id_access_seq OWNER TO showdeal;

--
-- Name: r_access_id_access_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_access_id_access_seq OWNED BY showdeal.r_access.id_access;


--
-- Name: r_asset; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_asset (
    id_asset bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    uin character varying NOT NULL,
    tp_asset character varying NOT NULL,
    status character varying NOT NULL,
    book_value numeric(18,2) DEFAULT 0 NOT NULL,
    appraised_value numeric(18,2) DEFAULT 0 NOT NULL,
    expected_value numeric(18,2) DEFAULT 0 NOT NULL,
    reserve_price numeric(18,2) DEFAULT 0 NOT NULL,
    starting_bid numeric(18,2) DEFAULT 0 NOT NULL,
    realized_value numeric(18,2) DEFAULT 0 NOT NULL,
    location_city character varying NOT NULL,
    location_address character varying NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_asset OWNER TO showdeal;

--
-- Name: COLUMN r_asset.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_asset.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_asset.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_asset.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: COLUMN r_asset.status; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_asset.status IS '-- REGISTERED
-- APPRAISED
-- PUBLISHED
-- IN_AUCTION
-- SOLD
-- UNSOLD
-- CANCELLED';


--
-- Name: COLUMN r_asset.book_value; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_asset.book_value IS 'valor contable';


--
-- Name: COLUMN r_asset.appraised_value; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_asset.appraised_value IS 'avalúo';


--
-- Name: COLUMN r_asset.expected_value; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_asset.expected_value IS 'expectativa interna';


--
-- Name: COLUMN r_asset.reserve_price; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_asset.reserve_price IS 'precio mínimo aceptable';


--
-- Name: COLUMN r_asset.starting_bid; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_asset.starting_bid IS 'valor base';


--
-- Name: COLUMN r_asset.realized_value; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_asset.realized_value IS 'valor finalmente adjudicado';


--
-- Name: r_asset_id_asset_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_asset_id_asset_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_asset_id_asset_seq OWNER TO showdeal;

--
-- Name: r_asset_id_asset_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_asset_id_asset_seq OWNED BY showdeal.r_asset.id_asset;


--
-- Name: r_attach; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_attach (
    id_attach bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    id_asset bigint NOT NULL,
    tp_attach character varying NOT NULL,
    file_name character varying,
    mime_type character varying,
    file_size_bytes bigint,
    file_hash character varying(64),
    file_content bytea,
    additional jsonb,
    CONSTRAINT chk_r_attach_content_not_empty CHECK (((file_content IS NULL) OR (octet_length(file_content) > 0))),
    CONSTRAINT chk_r_attach_hash_when_content CHECK (((file_content IS NULL) OR (file_hash IS NOT NULL))),
    CONSTRAINT chk_r_attach_size_when_content CHECK (((file_content IS NULL) OR (file_size_bytes IS NOT NULL))),
    CONSTRAINT chk_r_attach_tp_attach CHECK (((tp_attach)::text = ANY (ARRAY[('PHOTO'::character varying)::text, ('APPRAISAL'::character varying)::text, ('LEGAL_DOCUMENT'::character varying)::text, ('TITLE_DEED'::character varying)::text, ('INVOICE'::character varying)::text, ('TECHNICAL_REPORT'::character varying)::text]))),
    CONSTRAINT r_attach_check CHECK ((file_size_bytes >= 0))
);


ALTER TABLE showdeal.r_attach OWNER TO showdeal;

--
-- Name: r_attach_id_attach_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_attach_id_attach_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_attach_id_attach_seq OWNER TO showdeal;

--
-- Name: r_attach_id_attach_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_attach_id_attach_seq OWNED BY showdeal.r_attach.id_attach;


--
-- Name: r_auction; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_auction (
    id_auction bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    tp_auction character varying NOT NULL,
    id_event bigint NOT NULL,
    id_asset bigint NOT NULL,
    additional jsonb,
    CONSTRAINT r_auction_check CHECK (((tp_auction)::text = ANY ((ARRAY['SEALED_BID'::character varying, 'LIVE_AUCTION'::character varying])::text[])))
);


ALTER TABLE showdeal.r_auction OWNER TO showdeal;

--
-- Name: COLUMN r_auction.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_auction.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_auction.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_auction.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: COLUMN r_auction.tp_auction; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_auction.tp_auction IS 'SEALED_BID
LIVE_AUCTION';


--
-- Name: r_auction_id_auction_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_auction_id_auction_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_auction_id_auction_seq OWNER TO showdeal;

--
-- Name: r_auction_id_auction_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_auction_id_auction_seq OWNED BY showdeal.r_auction.id_auction;


--
-- Name: r_bid; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_bid (
    id_bid bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    id_auction bigint NOT NULL,
    id_user bigint NOT NULL,
    value numeric(18,2) DEFAULT 0 NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_bid OWNER TO showdeal;

--
-- Name: COLUMN r_bid.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_bid.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_bid.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_bid.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: r_bid_id_bid_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_bid_id_bid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_bid_id_bid_seq OWNER TO showdeal;

--
-- Name: r_bid_id_bid_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_bid_id_bid_seq OWNED BY showdeal.r_bid.id_bid;


--
-- Name: r_company; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_company (
    id_company bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    uin character varying NOT NULL,
    company character varying NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_company OWNER TO showdeal;

--
-- Name: COLUMN r_company.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_company.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_company.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_company.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: r_company_id_company_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_company_id_company_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_company_id_company_seq OWNER TO showdeal;

--
-- Name: r_company_id_company_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_company_id_company_seq OWNED BY showdeal.r_company.id_company;


--
-- Name: r_connection; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_connection (
    id_connection bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    id_company bigint NOT NULL,
    id_asset bigint NOT NULL,
    tp_connection character varying NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_connection OWNER TO showdeal;

--
-- Name: COLUMN r_connection.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_connection.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_connection.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_connection.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: r_connection_id_connection_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_connection_id_connection_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_connection_id_connection_seq OWNER TO showdeal;

--
-- Name: r_connection_id_connection_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_connection_id_connection_seq OWNED BY showdeal.r_connection.id_connection;


--
-- Name: r_event; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_event (
    id_event bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    tp_event character varying NOT NULL,
    start_at timestamp without time zone DEFAULT now() NOT NULL,
    end_at timestamp without time zone DEFAULT now() NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_event OWNER TO showdeal;

--
-- Name: COLUMN r_event.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_event.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_event.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_event.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: COLUMN r_event.tp_event; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_event.tp_event IS 'SINGLE_ITEM
LOT_BASED';


--
-- Name: r_event_id_event_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_event_id_event_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_event_id_event_seq OWNER TO showdeal;

--
-- Name: r_event_id_event_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_event_id_event_seq OWNED BY showdeal.r_event.id_event;


--
-- Name: r_invitation; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_invitation (
    id_invitation bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    id_event bigint NOT NULL,
    id_user bigint NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_invitation OWNER TO showdeal;

--
-- Name: r_invitation_id_invitation_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_invitation_id_invitation_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_invitation_id_invitation_seq OWNER TO showdeal;

--
-- Name: r_invitation_id_invitation_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_invitation_id_invitation_seq OWNED BY showdeal.r_invitation.id_invitation;


--
-- Name: r_log; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_log (
    id_log bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    tp_log character varying,
    log jsonb NOT NULL
);


ALTER TABLE showdeal.r_log OWNER TO showdeal;

--
-- Name: COLUMN r_log.tp_log; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_log.tp_log IS 'El nombre de la tabla afectada
r_access
r_asset
r_attach
r_auction
r_bid
r_company
r_connection
r_event
r_invitation
r_module
r_role
r_user';


--
-- Name: r_log_id_log_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_log_id_log_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_log_id_log_seq OWNER TO showdeal;

--
-- Name: r_log_id_log_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_log_id_log_seq OWNED BY showdeal.r_log.id_log;


--
-- Name: r_module; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_module (
    id_module bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    module character varying NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_module OWNER TO showdeal;

--
-- Name: COLUMN r_module.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_module.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_module.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_module.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: r_module_id_module_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_module_id_module_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_module_id_module_seq OWNER TO showdeal;

--
-- Name: r_module_id_module_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_module_id_module_seq OWNED BY showdeal.r_module.id_module;


--
-- Name: r_role; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_role (
    id_role bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    role character varying NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_role OWNER TO showdeal;

--
-- Name: COLUMN r_role.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_role.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_role.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_role.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: r_role_id_role_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_role_id_role_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_role_id_role_seq OWNER TO showdeal;

--
-- Name: r_role_id_role_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_role_id_role_seq OWNED BY showdeal.r_role.id_role;


--
-- Name: r_user; Type: TABLE; Schema: showdeal; Owner: showdeal
--

CREATE TABLE showdeal.r_user (
    id_user bigint NOT NULL,
    ins_at timestamp without time zone DEFAULT now() NOT NULL,
    upd_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    id_company bigint NOT NULL,
    id_role bigint NOT NULL,
    uin character varying NOT NULL,
    name character varying NOT NULL,
    user_1 character varying NOT NULL,
    authentication jsonb NOT NULL,
    additional jsonb
);


ALTER TABLE showdeal.r_user OWNER TO showdeal;

--
-- Name: COLUMN r_user.ins_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_user.ins_at IS 'Fecha de inserción de registro en la tabla';


--
-- Name: COLUMN r_user.upd_at; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_user.upd_at IS 'Ultima vez que se modifico el registro';


--
-- Name: COLUMN r_user.user_1; Type: COMMENT; Schema: showdeal; Owner: showdeal
--

COMMENT ON COLUMN showdeal.r_user.user_1 IS 'usuario de sistema';


--
-- Name: r_user_id_user_seq; Type: SEQUENCE; Schema: showdeal; Owner: showdeal
--

CREATE SEQUENCE showdeal.r_user_id_user_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE showdeal.r_user_id_user_seq OWNER TO showdeal;

--
-- Name: r_user_id_user_seq; Type: SEQUENCE OWNED BY; Schema: showdeal; Owner: showdeal
--

ALTER SEQUENCE showdeal.r_user_id_user_seq OWNED BY showdeal.r_user.id_user;


--
-- Name: r_access id_access; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_access ALTER COLUMN id_access SET DEFAULT nextval('showdeal.r_access_id_access_seq'::regclass);


--
-- Name: r_asset id_asset; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_asset ALTER COLUMN id_asset SET DEFAULT nextval('showdeal.r_asset_id_asset_seq'::regclass);


--
-- Name: r_attach id_attach; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_attach ALTER COLUMN id_attach SET DEFAULT nextval('showdeal.r_attach_id_attach_seq'::regclass);


--
-- Name: r_auction id_auction; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_auction ALTER COLUMN id_auction SET DEFAULT nextval('showdeal.r_auction_id_auction_seq'::regclass);


--
-- Name: r_bid id_bid; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_bid ALTER COLUMN id_bid SET DEFAULT nextval('showdeal.r_bid_id_bid_seq'::regclass);


--
-- Name: r_company id_company; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_company ALTER COLUMN id_company SET DEFAULT nextval('showdeal.r_company_id_company_seq'::regclass);


--
-- Name: r_connection id_connection; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_connection ALTER COLUMN id_connection SET DEFAULT nextval('showdeal.r_connection_id_connection_seq'::regclass);


--
-- Name: r_event id_event; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_event ALTER COLUMN id_event SET DEFAULT nextval('showdeal.r_event_id_event_seq'::regclass);


--
-- Name: r_invitation id_invitation; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_invitation ALTER COLUMN id_invitation SET DEFAULT nextval('showdeal.r_invitation_id_invitation_seq'::regclass);


--
-- Name: r_log id_log; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_log ALTER COLUMN id_log SET DEFAULT nextval('showdeal.r_log_id_log_seq'::regclass);


--
-- Name: r_module id_module; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_module ALTER COLUMN id_module SET DEFAULT nextval('showdeal.r_module_id_module_seq'::regclass);


--
-- Name: r_role id_role; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_role ALTER COLUMN id_role SET DEFAULT nextval('showdeal.r_role_id_role_seq'::regclass);


--
-- Name: r_user id_user; Type: DEFAULT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_user ALTER COLUMN id_user SET DEFAULT nextval('showdeal.r_user_id_user_seq'::regclass);


--
-- Name: r_access r_access_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_access
    ADD CONSTRAINT r_access_pk PRIMARY KEY (id_access);


--
-- Name: r_access r_access_unique; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_access
    ADD CONSTRAINT r_access_unique UNIQUE (id_module, id_role);


--
-- Name: r_asset r_asset_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_asset
    ADD CONSTRAINT r_asset_pk PRIMARY KEY (id_asset);


--
-- Name: r_attach r_attach_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_attach
    ADD CONSTRAINT r_attach_pk PRIMARY KEY (id_attach);


--
-- Name: r_attach r_attach_unique; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_attach
    ADD CONSTRAINT r_attach_unique UNIQUE (id_asset, file_hash);


--
-- Name: r_auction r_auction_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_auction
    ADD CONSTRAINT r_auction_pk PRIMARY KEY (id_auction);


--
-- Name: r_auction r_auction_unique; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_auction
    ADD CONSTRAINT r_auction_unique UNIQUE (id_event, id_asset);


--
-- Name: r_bid r_bid_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_bid
    ADD CONSTRAINT r_bid_pk PRIMARY KEY (id_bid);


--
-- Name: r_bid r_bid_unique; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_bid
    ADD CONSTRAINT r_bid_unique UNIQUE (id_auction, value, id_user);


--
-- Name: r_company r_company_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_company
    ADD CONSTRAINT r_company_pk PRIMARY KEY (id_company);


--
-- Name: r_connection r_connection_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_connection
    ADD CONSTRAINT r_connection_pk PRIMARY KEY (id_connection);


--
-- Name: r_event r_event_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_event
    ADD CONSTRAINT r_event_pk PRIMARY KEY (id_event);


--
-- Name: r_invitation r_invitation_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_invitation
    ADD CONSTRAINT r_invitation_pk PRIMARY KEY (id_invitation);


--
-- Name: r_invitation r_invitation_unique; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_invitation
    ADD CONSTRAINT r_invitation_unique UNIQUE (id_event, id_user);


--
-- Name: r_log r_log_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_log
    ADD CONSTRAINT r_log_pk PRIMARY KEY (id_log);


--
-- Name: r_module r_module_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_module
    ADD CONSTRAINT r_module_pk PRIMARY KEY (id_module);


--
-- Name: r_role r_role_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_role
    ADD CONSTRAINT r_role_pk PRIMARY KEY (id_role);


--
-- Name: r_user r_user_pk; Type: CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_user
    ADD CONSTRAINT r_user_pk PRIMARY KEY (id_user);


--
-- Name: idx_r_access_id_module; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_access_id_module ON showdeal.r_access USING btree (id_module);


--
-- Name: idx_r_access_id_role; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_access_id_role ON showdeal.r_access USING btree (id_role);


--
-- Name: idx_r_attach_id_asset; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_attach_id_asset ON showdeal.r_attach USING btree (id_asset);


--
-- Name: idx_r_auction_id_asset; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_auction_id_asset ON showdeal.r_auction USING btree (id_asset);


--
-- Name: idx_r_auction_id_event; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_auction_id_event ON showdeal.r_auction USING btree (id_event);


--
-- Name: idx_r_bid_id_auction; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_bid_id_auction ON showdeal.r_bid USING btree (id_auction);


--
-- Name: idx_r_bid_id_user; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_bid_id_user ON showdeal.r_bid USING btree (id_user);


--
-- Name: idx_r_connection_asset; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_connection_asset ON showdeal.r_connection USING btree (id_asset);


--
-- Name: idx_r_connection_company; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_connection_company ON showdeal.r_connection USING btree (id_company);


--
-- Name: idx_r_connection_id_asset; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_connection_id_asset ON showdeal.r_connection USING btree (id_asset);


--
-- Name: idx_r_connection_id_company; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_connection_id_company ON showdeal.r_connection USING btree (id_company);


--
-- Name: idx_r_invitation_id_event; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_invitation_id_event ON showdeal.r_invitation USING btree (id_event);


--
-- Name: idx_r_invitation_id_user; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_invitation_id_user ON showdeal.r_invitation USING btree (id_user);


--
-- Name: idx_r_user_id_company; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_user_id_company ON showdeal.r_user USING btree (id_company);


--
-- Name: idx_r_user_id_role; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX idx_r_user_id_role ON showdeal.r_user USING btree (id_role);


--
-- Name: r_log_ins_at_idx; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX r_log_ins_at_idx ON showdeal.r_log USING btree (ins_at DESC);


--
-- Name: r_log_tp_log_idx; Type: INDEX; Schema: showdeal; Owner: showdeal
--

CREATE INDEX r_log_tp_log_idx ON showdeal.r_log USING btree (tp_log);


--
-- Name: r_access trg_r_access_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_access_upd_at BEFORE UPDATE ON showdeal.r_access FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_asset trg_r_asset_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_asset_upd_at BEFORE UPDATE ON showdeal.r_asset FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_attach trg_r_attach_metadata; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_attach_metadata BEFORE INSERT OR UPDATE OF file_content ON showdeal.r_attach FOR EACH ROW EXECUTE FUNCTION showdeal.fn_attach_metadata();


--
-- Name: r_attach trg_r_attach_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_attach_upd_at BEFORE UPDATE ON showdeal.r_attach FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_auction trg_r_auction_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_auction_upd_at BEFORE UPDATE ON showdeal.r_auction FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_bid trg_r_bid_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_bid_upd_at BEFORE UPDATE ON showdeal.r_bid FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_company trg_r_company_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_company_upd_at BEFORE UPDATE ON showdeal.r_company FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_connection trg_r_connection_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_connection_upd_at BEFORE UPDATE ON showdeal.r_connection FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_event trg_r_event_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_event_upd_at BEFORE UPDATE ON showdeal.r_event FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_invitation trg_r_invitation_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_invitation_upd_at BEFORE UPDATE ON showdeal.r_invitation FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_module trg_r_module_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_module_upd_at BEFORE UPDATE ON showdeal.r_module FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_role trg_r_role_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_role_upd_at BEFORE UPDATE ON showdeal.r_role FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_user trg_r_user_upd_at; Type: TRIGGER; Schema: showdeal; Owner: showdeal
--

CREATE TRIGGER trg_r_user_upd_at BEFORE UPDATE ON showdeal.r_user FOR EACH ROW EXECUTE FUNCTION showdeal.fn_set_upd_at();


--
-- Name: r_attach r_asset_r_attach_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_attach
    ADD CONSTRAINT r_asset_r_attach_fk FOREIGN KEY (id_asset) REFERENCES showdeal.r_asset(id_asset) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_auction r_asset_r_auction_x_asset_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_auction
    ADD CONSTRAINT r_asset_r_auction_x_asset_fk FOREIGN KEY (id_asset) REFERENCES showdeal.r_asset(id_asset) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_connection r_asset_r_connection_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_connection
    ADD CONSTRAINT r_asset_r_connection_fk FOREIGN KEY (id_asset) REFERENCES showdeal.r_asset(id_asset) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_auction r_auction_r_auction_x_asset_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_auction
    ADD CONSTRAINT r_auction_r_auction_x_asset_fk FOREIGN KEY (id_event) REFERENCES showdeal.r_event(id_event) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_bid r_auction_x_asset_r_bid_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_bid
    ADD CONSTRAINT r_auction_x_asset_r_bid_fk FOREIGN KEY (id_auction) REFERENCES showdeal.r_auction(id_auction) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_connection r_company_r_connection_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_connection
    ADD CONSTRAINT r_company_r_connection_fk FOREIGN KEY (id_company) REFERENCES showdeal.r_company(id_company) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_user r_company_r_user_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_user
    ADD CONSTRAINT r_company_r_user_fk FOREIGN KEY (id_company) REFERENCES showdeal.r_company(id_company) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_invitation r_event_r_invitation_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_invitation
    ADD CONSTRAINT r_event_r_invitation_fk FOREIGN KEY (id_event) REFERENCES showdeal.r_event(id_event) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_access r_module_r_access_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_access
    ADD CONSTRAINT r_module_r_access_fk FOREIGN KEY (id_module) REFERENCES showdeal.r_module(id_module) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_access r_role_r_access_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_access
    ADD CONSTRAINT r_role_r_access_fk FOREIGN KEY (id_role) REFERENCES showdeal.r_role(id_role) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_user r_role_r_user_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_user
    ADD CONSTRAINT r_role_r_user_fk FOREIGN KEY (id_role) REFERENCES showdeal.r_role(id_role) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: r_bid r_user_r_bid_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_bid
    ADD CONSTRAINT r_user_r_bid_fk FOREIGN KEY (id_user) REFERENCES showdeal.r_user(id_user);


--
-- Name: r_invitation r_user_r_invitation_fk; Type: FK CONSTRAINT; Schema: showdeal; Owner: showdeal
--

ALTER TABLE ONLY showdeal.r_invitation
    ADD CONSTRAINT r_user_r_invitation_fk FOREIGN KEY (id_user) REFERENCES showdeal.r_user(id_user) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

