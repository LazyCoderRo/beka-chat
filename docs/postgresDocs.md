
How to use this image
start a postgres instance

$ docker run --name some-postgres -e POSTGRES_PASSWORD=mysecretpassword -d postgres

The default postgres user and database are created in the entrypoint with initdb.

    The postgres database is a default database meant for use by users, utilities and third party applications.

    postgresql.org/docs

... or via psql

$ docker run -it --rm --network some-network postgres psql -h some-postgres -U postgres
psql (14.3)
Type "help" for help.

postgres=# SELECT 1;
 ?column? 
----------
        1
(1 row)

... via docker compose

Example compose.yaml for postgres:

# Use postgres/example user/password credentials

services:

  db:
    image: postgres
    restart: always
    # set shared memory limit when using docker compose
    shm_size: 128mb
    # or set shared memory limit when deploy via swarm stack
    #volumes:
    #  - type: tmpfs
    #    target: /dev/shm
    #    tmpfs:
    #      size: 134217728 # 128*2^20 bytes = 128Mb
    environment:
      POSTGRES_PASSWORD: example

  adminer:
    image: adminer
    restart: always
    ports:
      - 8080:8080

Run docker compose up, wait for it to initialize completely, and visit http://localhost:8080 or http://host-ip:8080 (as appropriate).
How to extend this image

There are many ways to extend the postgres image. Without trying to support every possible use case, here are just a few that we have found useful.
Environment Variables

The PostgreSQL image uses several environment variables which are easy to miss. The only variable required is POSTGRES_PASSWORD, the rest are optional.

Warning: the Docker specific variables will only have an effect if you start the container with a data directory that is empty; any pre-existing database will be left untouched on container startup.
POSTGRES_PASSWORD

This environment variable is required for you to use the PostgreSQL image. It must not be empty or undefined. This environment variable sets the superuser password for PostgreSQL. The default superuser is defined by the POSTGRES_USER environment variable.

Note 1: The PostgreSQL image sets up trust authentication locally so you may notice a password is not required when connecting from localhost (inside the same container). However, a password will be required if connecting from a different host/container.

Note 2: This variable defines the superuser password in the PostgreSQL instance, as set by the initdb script during initial container startup. It has no effect on the PGPASSWORD environment variable that may be used by the psql client at runtime, as described at https://www.postgresql.org/docs/14/libpq-envars.html. PGPASSWORD, if used, will be specified as a separate environment variable.
POSTGRES_USER

This optional environment variable is used in conjunction with POSTGRES_PASSWORD to set a user and its password. This variable will create the specified user with superuser power and a database with the same name. If it is not specified, then the default user of postgres will be used.

Be aware that if this parameter is specified, PostgreSQL will still show The files belonging to this database system will be owned by user "postgres" during initialization. This refers to the Linux system user (from /etc/passwd in the image) that the postgres daemon runs as, and as such is unrelated to the POSTGRES_USER option. See the section titled "Arbitrary --user Notes" for more details.
POSTGRES_DB

This optional environment variable can be used to define a different name for the default database that is created when the image is first started. If it is not specified, then the value of POSTGRES_USER will be used.
POSTGRES_INITDB_ARGS

This optional environment variable can be used to send arguments to postgres initdb. The value is a space separated string of arguments as postgres initdb would expect them. This is useful for adding functionality like data page checksums: -e POSTGRES_INITDB_ARGS="--data-checksums".
POSTGRES_INITDB_WALDIR

This optional environment variable can be used to define another location for the Postgres transaction log. By default the transaction log is stored in a subdirectory of the main Postgres data folder (PGDATA). Sometimes it can be desireable to store the transaction log in a different directory which may be backed by storage with different performance or reliability characteristics.

Note: on PostgreSQL 9.x, this variable is POSTGRES_INITDB_XLOGDIR (reflecting the changed name of the --xlogdir flag to --waldir in PostgreSQL 10+).
POSTGRES_HOST_AUTH_METHOD

This optional variable can be used to control the auth-method for host connections for all databases, all users, and all addresses. If unspecified then scram-sha-256 password authentication is used (in 14+; md5 in older releases). On an uninitialized database, this will populate pg_hba.conf via this approximate line:

echo "host all all all $POSTGRES_HOST_AUTH_METHOD" >> pg_hba.conf

See the PostgreSQL documentation on pg_hba.conf for more information about possible values and their meanings.

Note 1: It is not recommended to use trust since it allows anyone to connect without a password, even if one is set (like via POSTGRES_PASSWORD). For more information see the PostgreSQL documentation on Trust Authentication.

Note 2: If you set POSTGRES_HOST_AUTH_METHOD to trust, then POSTGRES_PASSWORD is not required.

Note 3: If you set this to an alternative value (such as scram-sha-256), you might need additional POSTGRES_INITDB_ARGS for the database to initialize correctly (such as POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256).
PGDATA

    Important Change: the PGDATA environment variable of the image was changed to be version specific in PostgreSQL 18 and above. For 18 it is /var/lib/postgresql/18/docker. Later versions will replace 18 with their respective major version (e.g., /var/lib/postgresql/19/docker for PostgreSQL 19.x). The defined VOLUME was changed in 18 and above to /var/lib/postgresql. Mounts and volumes should be targeted at the updated location. This will allow users upgrading between PostgreSQL major releases to use the faster --link when running pg_upgrade and mounting /var/lib/postgresql.

Users who wish to opt-in to this change on older releases can do so by setting PGDATA explicitly (--env PGDATA=/var/lib/postgresql/17/docker --volume some-postgres:/var/lib/postgresql). To migrate pre-existing data, adjust the volume's folder structure appropriately first (moving all database files into a PG_MAJOR/docker subdirectory).

    Important Note: (for PostgreSQL 17 and below) Mount the data volume at /var/lib/postgresql/data and not at /var/lib/postgresql because mounts at the latter path WILL NOT PERSIST database data when the container is re-created. The Dockerfile that builds the image declares a volume at /var/lib/postgresql/data and if no data volume is mounted at that path then the container runtime will automatically create an anonymous volume that is not reused across container re-creations. Data will be written to the anonymous volume rather than your intended data volume and won't persist when the container is deleted and re-created.

This (PGDATA) is an environment variable that is not Docker specific. Because the variable is used by the postgres server binary (see the PostgreSQL docs), the entrypoint script takes it into account.
Docker Secrets

As an alternative to passing sensitive information via environment variables, _FILE may be appended to some of the previously listed environment variables, causing the initialization script to load the values for those variables from files present in the container. In particular, this can be used to load passwords from Docker secrets stored in /run/secrets/<secret_name> files. For example:

$ docker run --name some-postgres -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres-passwd -d postgres

Currently, this is only supported for POSTGRES_INITDB_ARGS, POSTGRES_PASSWORD, POSTGRES_USER, and POSTGRES_DB.
Initialization scripts

If you would like to do additional initialization in an image derived from this one, add one or more *.sql, *.sql.gz, or *.sh scripts under /docker-entrypoint-initdb.d (creating the directory if necessary). After the entrypoint calls initdb to create the default postgres user and database, it will run any *.sql files, run any executable *.sh scripts, and source any non-executable *.sh scripts found in that directory to do further initialization before starting the service.

Warning: scripts in /docker-entrypoint-initdb.d are only run if you start the container with a data directory that is empty; any pre-existing database will be left untouched on container startup. One common problem is that if one of your /docker-entrypoint-initdb.d scripts fails (which will cause the entrypoint script to exit) and your orchestrator restarts the container with the already initialized data directory, it will not continue on with your scripts.

For example, to add an additional user and database, add the following to /docker-entrypoint-initdb.d/init-user-db.sh:

#!/usr/bin/env bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER docker;
	CREATE DATABASE docker;
	GRANT ALL PRIVILEGES ON DATABASE docker TO docker;
EOSQL

These initialization files will be executed in sorted name order as defined by the current locale, which defaults to en_US.utf8. Any *.sql files will be executed by POSTGRES_USER, which defaults to the postgres superuser. It is recommended that any psql commands that are run inside of a *.sh script be executed as POSTGRES_USER by using the --username "$POSTGRES_USER" flag. This user will be able to connect without a password due to the presence of trust authentication for Unix socket connections made inside the container.

Additionally, as of docker-library/postgres#253, these initialization scripts are run as the postgres user (or as the "semi-arbitrary user" specified with the --user flag to docker run; see the section titled "Arbitrary --user Notes" for more details). Also, as of docker-library/postgres#440, the temporary daemon started for these initialization scripts listens only on the Unix socket, so any psql usage should drop the hostname portion (see docker-library/postgres#474 (comment) for example).
Database Configuration

There are many ways to set PostgreSQL server configuration. For information on what is available to configure, see the PostgreSQL docs for the specific version of PostgreSQL that you are running. Here are a few options for setting configuration:

    Use a custom config file. Create a config file and get it into the container. If you need a starting place for your config file you can use the sample provided by PostgreSQL which is available in the container at /usr/share/postgresql/postgresql.conf.sample (/usr/local/share/postgresql/postgresql.conf.sample in Alpine variants).
        Important note: you must set listen_addresses = '*'so that other containers will be able to access postgres.

    $ # get the default config
    $ docker run -i --rm postgres cat /usr/share/postgresql/postgresql.conf.sample > my-postgres.conf

    $ # customize the config

    $ # run postgres with custom config
    $ docker run -d --name some-postgres -v "$PWD/my-postgres.conf":/etc/postgresql/postgresql.conf -e POSTGRES_PASSWORD=mysecretpassword postgres -c 'config_file=/etc/postgresql/postgresql.conf'

    Set options directly on the run line. The entrypoint script is made so that any options passed to the docker command will be passed along to the postgres server daemon. From the PostgreSQL docs we see that any option available in a .conf file can be set via -c.

    $ docker run -d --name some-postgres -e POSTGRES_PASSWORD=mysecretpassword postgres -c shared_buffers=256MB -c max_connections=200

Locale Customization

You can extend the Debian-based images with a simple Dockerfile to set a different locale. The following example will set the default locale to de_DE.utf8:

FROM postgres:14.3
RUN localedef -i de_DE -c -f UTF-8 -A /usr/share/locale/locale.alias de_DE.UTF-8
ENV LANG de_DE.utf8

Since database initialization only happens on container startup, this allows us to set the language before it is created.

Also of note, Alpine-based variants starting with Postgres 15 support ICU locales. Previous Postgres versions based on alpine do not support locales; see "Character sets and locale" in the musl documentation for more details.

You can set locales in the Alpine-based images with POSTGRES_INITDB_ARGS to set a different locale. The following example will set the default locale for a newly initialized database to de_DE.utf8:

$ docker run -d -e LANG=de_DE.utf8 -e POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=de-DE" -e POSTGRES_PASSWORD=mysecretpassword postgres:15-alpine 

Additional Extensions

When using the default (Debian-based) variants, installing additional extensions (such as PostGIS) should be as simple as installing the relevant packages (see github.com/postgis/docker-postgis for a concrete example).

When using the Alpine variants, any postgres extension not listed in postgres-contrib will need to be compiled in your own image (again, see github.com/postgis/docker-postgis for a concrete example).
Arbitrary --user Notes

As of docker-library/postgres#253, this image supports running as a (mostly) arbitrary user via --user on docker run. As of docker-library/postgres#1018, this is also the case for the Alpine variants.

The main caveat to note is that postgres doesn't care what UID it runs as (as long as the owner of PGDATA matches), but initdb does care (and needs the user to exist in /etc/passwd):

$ docker run -it --rm --user www-data -e POSTGRES_PASSWORD=mysecretpassword postgres
The files belonging to this database system will be owned by user "www-data".
...

$ docker run -it --rm --user 1000:1000 -e POSTGRES_PASSWORD=mysecretpassword postgres
initdb: could not look up effective user ID 1000: user does not exist

The three easiest ways to get around this:

    allow the image to use the nss_wrapper library to "fake" /etc/passwd contents for you (see docker-library/postgres#448 for more details)

    bind-mount /etc/passwd read-only from the host (if the UID you desire is a valid user on your host):

    $ docker run -it --rm --user "$(id -u):$(id -g)" -v /etc/passwd:/etc/passwd:ro -e POSTGRES_PASSWORD=mysecretpassword postgres
    The files belonging to this database system will be owned by user "jsmith".
    ...

    initialize the target directory separately from the final runtime (with a chown in between):

...

Note: the description for this image is longer than the Hub length limit of 25000, so has been trimmed. The full description can be found at https://github.com/docker-library/docs/tree/master/postgres/README.md. See also docker/hub-feedback#238 and docker/roadmap#475.
