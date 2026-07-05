# Mapseries

As name hints mapseries is a web application for presenting, editing and cataloging map's series. The application consists of three separate applications. Presentation application listening on root `/`, [cataloging application](catalog/README.md) listening on `/catalog` and application for editing and creating new series listening on `/edit`.

> **📄 Modernizace stacku:** backend byl převeden z WildFly/JSF/Java EE na Spring Boot 3 / Java 17. Přehled změn, důvodů (technologie po konci podpory) a stavu projektu je v [**MIGRATION-REPORT.md**](MIGRATION-REPORT.md).

## How to deploy

Recommended way for deploying the application is to use [Docker Compose](https://docs.docker.com/compose/). In the root's directory of the repository you can find file `docker-compose.yml` which can be used as a template for your deployment. Everything what must be done is just filling in few environment variables described below. If you are done, just run following command in the root's directory.

```bash
docker-compose up
```

### Configuring the deployment

As it was indicated in previous paragraph, if you want to deploy the application, you have to configure few environment variables. In this chapter I will explain meaning of this variables and what values you should put in.

| Name                                                           | Description                                                                                                   |
| -------------------------------------------------------|  -------------------------------------------------------------------------------------------- |
| GITHUB_CLIENT_ID <br> GITHUB_CLIENT_SECRET | These variables are needed for github authentication. For more information what they mean and mainly how to get them, see [Github's official documentation](https://developer.github.com/v3/guides/basics-of-authentication/). |
| POSTGRES_PASSWORD                               | This variable is required by [postgres image](https://hub.docker.com/_/postgres/) and it defines password for the postgres user. |

It is also important to configure volume for your postgres image, so the database data are preserved between restart of the postgres image.

### Preparation of the database

If you run the mapseries application using the `docker-compose` for the first time, it won't work yet because the postgres database must be prepared. You have to create database and user which are expected by the application. To prepare the database use following commands.

```bash
# attach to running postgres container
docker exec -it mapseries_postgres_1 bash
# login into the postgres. As a password use value passed to POSTGRES_PASSWORD env variable
psql -U postgres -W
# Execute following commands
CREATE USER mapseries WITH PASSWORD 'mapseries';
CREATE DATABASE mapseries WITH owner = mapseries;
```

After that restart the application.

```bash
docker-compose restart
```

Last step you have to do is set up one Github account as admin account for presentation application. Others admins may be added via GUI. Login to postgres database as it was described in previous paragraph. However now use username and password `mapseries`. Then execute following SQL command.

```
psql -U mapseries -W
INSERT INTO admindao (name) VALUES ('admin');
```
