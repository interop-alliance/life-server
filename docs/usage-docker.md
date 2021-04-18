# Usage with Docker

You can run life-server from our 
[prebuilt docker image](https://hub.docker.com/r/interopalliance/life-server) 
with the following commands.

Run latest build from `main` branch

```
docker run -p 7070:7070 interopalliance/life-server:main
```

Run a tagged release

```
docker run -p 7070:7070 interopalliance/life-server:{gitTag}
# e.g. docker run -p 7070:7070 interopalliance/life-server:v6.0.2
```

You can then access the application at https://localhost:7070.

If you want to provide a custom config.js, mount it as a volume:

```
docker run -p 7070:7070 -v $(pwd)/config.json:/usr/src/app/config.dev.js
```

### Build your own Docker image

Clone the repository, then:

```
docker build -t life-server .
docker run -p 7070:7070 life-server
```
